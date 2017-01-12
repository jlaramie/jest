/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

import type {HasteContext} from 'types/HasteMap';
import type {Config} from 'types/Config';

const ansiEscapes = require('ansi-escapes');
const chalk = require('chalk');
const {clearLine} = require('jest-util');
const createHasteContext = require('./lib/createHasteContext');
const HasteMap = require('jest-haste-map');
const preRunMessage = require('./preRunMessage');
const printTypeahead = require('./printTypeahead');
const runJest = require('./runJest');
const setWatchMode = require('./lib/setWatchMode');
const SearchSource = require('./SearchSource');
const TestWatcher = require('./TestWatcher');
const {KEYS, CLEAR} = require('./constants');

const watch = (
  config: Config,
  pipe: stream$Writable | tty$WriteStream,
  argv: Object,
  hasteMap: HasteMap,
  hasteContext: HasteContext,
  stdin?: stream$Readable | tty$ReadStream = process.stdin
) => {
  setWatchMode(argv, argv.watch ? 'watch' : 'watchAll', {
    pattern: argv._,
  });
  let currentPattern = '';
  let hasSnapshotFailure = false;
  let isEnteringPattern = false;
  let isRunning = false;
  let testWatcher;
  let displayHelp = true;
  let searchSource = new SearchSource(hasteContext, config);

  hasteMap.on('change', ({hasteFS, moduleMap}) => {
    hasteContext = createHasteContext(config, {hasteFS, moduleMap});
    currentPattern = '';
    isEnteringPattern = false;
    searchSource = new SearchSource(hasteContext, config);
    startRun();
  });

  const writeCurrentPattern = () => {
    let regex;

    try {
      regex = new RegExp(currentPattern, 'i');
    } catch (e) {}

    const paths = regex ?
      searchSource.findMatchingTests(currentPattern).paths : [];

    pipe.write(ansiEscapes.cursorHide);
    pipe.write(ansiEscapes.clearScreen);
    pipe.write(`\n${chalk.bold('Pattern Mode Usage')}\n`);
    pipe.write(chalk.dim(' \u203A Press ') + 'ESC' + chalk.dim(' exit pattern mode.') + '\n\n');
    printTypeahead(config, pipe, currentPattern, paths);
    pipe.write(ansiEscapes.cursorShow);
  };

  const startRun = (overrideConfig: Object = {}) => {
    if (isRunning) {
      return null;
    }

    testWatcher = new TestWatcher({isWatchMode: true});
    pipe.write(CLEAR);
    preRunMessage.print(pipe);
    isRunning = true;
    return runJest(
      hasteContext,
      // $FlowFixMe
      Object.freeze(Object.assign({}, config, overrideConfig)),
      argv,
      pipe,
      testWatcher,
      results => {
        isRunning = false;
        hasSnapshotFailure = !!results.snapshot.failure;
        // Create a new testWatcher instance so that re-runs won't be blocked.
        // The old instance that was passed to Jest will still be interrupted
        // and prevent test runs from the previous run.
        testWatcher = new TestWatcher({isWatchMode: true});
        if (displayHelp) {
          pipe.write(usage(argv, hasSnapshotFailure));
          displayHelp = !process.env.JEST_HIDE_USAGE;
        }
      },
    ).then(
      () => {},
      error => console.error(chalk.red(error.stack)),
    );
  };

  const onKeypress = (key: string) => {
    if (key === KEYS.CONTROL_C || key === KEYS.CONTROL_D) {
      process.exit(0);
      return;
    }
    if (isEnteringPattern) {
      switch (key) {
        case KEYS.ENTER:
          isEnteringPattern = false;
          setWatchMode(argv, 'watch', {
            pattern: [currentPattern],
          });
          startRun();
          break;
        case KEYS.ESCAPE:
          isEnteringPattern = false;
          pipe.write(ansiEscapes.cursorHide);
          pipe.write(ansiEscapes.clearScreen);
          pipe.write(usage(argv, hasSnapshotFailure));
          pipe.write(ansiEscapes.cursorShow);
          currentPattern = argv._[0];
          break;
        case KEYS.ARROW_DOWN:
        case KEYS.ARROW_LEFT:
        case KEYS.ARROW_RIGHT:
        case KEYS.ARROW_UP:
          break;
        default:
          const char = new Buffer(key, 'hex').toString();
          currentPattern = key === KEYS.BACKSPACE
            ? currentPattern.slice(0, -1)
            : currentPattern + char;
          writeCurrentPattern();
          break;
      }
      return;
    }

    // Abort test run
    if (
      isRunning &&
      testWatcher &&
      [KEYS.Q, KEYS.ENTER, KEYS.A, KEYS.O, KEYS.P].indexOf(key) !== -1
    ) {
      testWatcher.setState({interrupted: true});
      return;
    }

    switch (key) {
      case KEYS.Q:
        process.exit(0);
        return;
      case KEYS.ENTER:
        startRun();
        break;
      case KEYS.U:
        startRun({updateSnapshot: true});
        break;
      case KEYS.A:
        setWatchMode(argv, 'watchAll');
        startRun();
        break;
      case KEYS.O:
        setWatchMode(argv, 'watch');
        startRun();
        break;
      case KEYS.P:
        isEnteringPattern = true;
        currentPattern = '';
        pipe.write(ansiEscapes.eraseScreen);
        writeCurrentPattern();
        break;
      case KEYS.QUESTION_MARK:
        if (process.env.JEST_HIDE_USAGE) {
          pipe.write(usage(argv, hasSnapshotFailure));
        }
        break;
    }
  };

  if (typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('hex');
    stdin.on('data', onKeypress);
  }

  startRun();
  return Promise.resolve();
};

const usage = (
  argv,
  snapshotFailure,
  delimiter = '\n',
) => {
  /* eslint-disable max-len */
  const messages = [
    '\n' + chalk.bold('Watch Usage'),
    argv.watch
      ? chalk.dim(' \u203A Press ') + 'a' + chalk.dim(' to run all tests.')
      : null,
    (argv.watchAll || argv._) && !argv.noSCM
      ? chalk.dim(' \u203A Press ') + 'o' + chalk.dim(' to only run tests related to changed files.')
      : null,
    snapshotFailure
      ? chalk.dim(' \u203A Press ') + 'u' + chalk.dim(' to update failing snapshots.')
      : null,
    chalk.dim(' \u203A Press ') + 'p' + chalk.dim(' to filter by a filename regex pattern.'),
    chalk.dim(' \u203A Press ') + 'q' + chalk.dim(' to quit watch mode.'),
    chalk.dim(' \u203A Press ') + 'Enter' + chalk.dim(' to trigger a test run.'),
  ];
  /* eslint-enable max-len */
  return messages.filter(message => !!message).join(delimiter) + '\n';
};

module.exports = watch;
