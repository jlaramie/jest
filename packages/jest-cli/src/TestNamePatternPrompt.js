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

import type {TestResult} from 'types/TestResult';

const ansiEscapes = require('ansi-escapes');
const chalk = require('chalk');
const scroll = require('./lib/scroll-list');
const {getTerminalWidth} = require('./lib/terminalUtils');
const stringLength = require('string-length');
const Prompt = require('./lib/Prompt');
const formatTestNameByPattern = require('./lib/formatTestNameByPattern');

const pluralizeTest = (total: number) => (total === 1 ? 'test' : 'tests');

const usage = () =>
  `\n${chalk.bold('Pattern Mode Usage')}\n` +
  ` ${chalk.dim('\u203A Press')} Esc ${chalk.dim('to exit pattern mode.')}\n` +
  ` ${chalk.dim('\u203A Press')} Enter ` +
  `${chalk.dim('to apply pattern to all tests.')}\n` +
  `\n`;

const usageRows = usage().split('\n').length;

module.exports = class TestNamePatternPrompt {
  _cachedTestResults: Array<TestResult>;
  _pipe: stream$Writable | tty$WriteStream;
  _prompt: Prompt;
  _currentUsageRows: number;

  constructor(pipe: stream$Writable | tty$WriteStream, prompt: Prompt) {
    this._pipe = pipe;
    this._prompt = prompt;
    this._currentUsageRows = usageRows;
  }

  run(onSuccess: Function, onCancel: Function, options?: {header: string}) {
    this._pipe.write(ansiEscapes.cursorHide);
    this._pipe.write(ansiEscapes.clearScreen);
    if (options && options.header) {
      this._pipe.write(options.header + '\n');
      this._currentUsageRows = usageRows + options.header.split('\n').length;
    } else {
      this._currentUsageRows = usageRows;
    }
    this._pipe.write(usage());
    this._pipe.write(ansiEscapes.cursorShow);

    this._prompt.enter(this._onChange.bind(this), onSuccess, onCancel);
  }

  _onChange(pattern: string, options) {
    this._pipe.write(ansiEscapes.eraseLine);
    this._pipe.write(ansiEscapes.cursorLeft);
    this._printTypeahead(pattern, Object.assign({max: 10}, options));
  }

  _printTypeahead(pattern: string, options) {
    const { max } = options;
    const matchedTests = this._getMatchedTests(pattern);

    const total = matchedTests.length;
    const inputText = `${chalk.dim(' pattern \u203A')} ${pattern}`;

    this._pipe.write(ansiEscapes.eraseDown);
    this._pipe.write(inputText);
    this._pipe.write(ansiEscapes.cursorSavePosition);

    if (pattern) {
      if (total) {
        this._pipe.write(
          `\n\n Pattern matches ${total} ${pluralizeTest(total)}`,
        );
      } else {
        this._pipe.write(`\n\n Pattern matches no tests`);
      }

      this._pipe.write(' from cached test suites.');

      const width = getTerminalWidth();
      const { start, end, index } = scroll(matchedTests.length, options);

      matchedTests.slice(start, end)
      .map(name => formatTestNameByPattern(name, pattern, width - 4))
      .map((item, i) => {
        if (i === index) {
          this._prompt.setSelected('^' + chalk.stripColor(item) + '$');
          return chalk.black.bgYellow(chalk.stripColor(item));
        }
        return item;
      })
      .forEach(output => this._pipe.write(`\n ${chalk.dim('\u203A')} ${output}`));

      if (total > max) {
        const more = total - max;
        this._pipe.write(
          // eslint-disable-next-line max-len
          `\n ${chalk.dim(`\u203A and ${more} more ${pluralizeTest(more)}`)}`,
        );
      }
    } else {
      this._pipe.write(
        // eslint-disable-next-line max-len
        `\n\n ${chalk.italic.yellow('Start typing to filter by a test name regex pattern.')}`,
      );
    }

    this._pipe.write(
      ansiEscapes.cursorTo(stringLength(inputText), this._currentUsageRows - 1),
    );
    this._pipe.write(ansiEscapes.cursorRestorePosition);
  }

  _getMatchedTests(pattern: string) {
    let regex;

    try {
      regex = new RegExp(pattern, 'i');
    } catch (e) {
      return [];
    }

    const matchedTests = [];

    this._cachedTestResults.forEach(({testResults}) =>
      testResults.forEach(({title}) => {
        if (regex.test(title)) {
          matchedTests.push(title);
        }
      }),
    );

    return matchedTests;
  }

  updateCachedTestResults(testResults: Array<TestResult>) {
    this._cachedTestResults = testResults || [];
  }
};
