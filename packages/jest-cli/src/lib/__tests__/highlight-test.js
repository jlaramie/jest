/**
* Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
*
* This source code is licensed under the BSD-style license found in the
* LICENSE file in the root directory of this source tree. An additional grant
* of patent rights can be found in the PATENTS file in the same directory.
*
* @emails oncall+jsinfra
*/

'use strict';

const {dim} = require('chalk');
const highlight = require('../highlight');

it('Highlight only the matching part and dims the rest', () => {
  expect(highlight('path/to/test', 't.*s'))
    .toEqual(`${dim('pa')}th/to/tes${dim('t')}`);

  expect(highlight('path/to/test', 'path/to/test'))
    .toEqual(`path/to/test`);
});

it('Returns the a dimmed string when nothing matches', () => {
  expect(highlight('path/to/test', 'other'))
    .toEqual(dim('path/to/test'));
});
