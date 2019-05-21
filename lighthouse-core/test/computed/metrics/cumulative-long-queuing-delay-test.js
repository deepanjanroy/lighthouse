/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const CumulativeLongQueuingDelay =
  require('../../../computed/metrics/cumulative-long-queuing-delay.js');
const assert = require('assert');

const trace = require('../../fixtures/traces/progressive-app-m60.json');
const devtoolsLog = require('../../fixtures/traces/progressive-app-m60.devtools.log.json');

/* eslint-env jest */

describe('Metrics: CumulativeLongQueuingDelay', () => {
  it('should compute a simulated value', async () => {
    const settings = {throttlingMethod: 'simulate'};
    const context = {settings, computedCache: new Map()};
    const result = await CumulativeLongQueuingDelay.request(
      {trace, devtoolsLog, settings},
      context
    );

    expect({
      timing: Math.round(result.timing),
      optimistic: Math.round(result.optimisticEstimate.timeInMs),
      pessimistic: Math.round(result.pessimisticEstimate.timeInMs),
    }).toMatchSnapshot();
  });

  it('should compute an observed value', async () => {
    const settings = {throttlingMethod: 'provided'};
    const context = {settings, computedCache: new Map()};
    const result = await CumulativeLongQueuingDelay.request(
      {trace, devtoolsLog, settings},
      context
    );
    assert.equal(Math.round(result.timing * 10) / 10, 48.3);
  });

  describe('#calculateSumOfLongQueuingDelay', () => {
    it('reports 0 when no task is longer than 50ms', async () => {
      const events = [
        {start: 1000, end: 1050, duration: 50},
        {start: 2000, end: 2010, duration: 10},
      ];

      const fcpTimeMs = 500;
      const interactiveTimeMs = 4000;

      assert.equal(
        CumulativeLongQueuingDelay.calculateSumOfLongQueuingDelay(
          events, fcpTimeMs, interactiveTimeMs), 0);
    });

    it('only looks at tasks within FMP and TTI', () => {
      const events = [
        // TODO(deepanjanroy@): Is there an interval data structure in lighthouse?
        // Specifying both end time and duration like this is error prone.
        {start: 1000, end: 1060, duration: 60},
        {start: 2000, end: 2100, duration: 100},
        {start: 2300, end: 2450, duration: 150},
        {start: 2600, end: 2800, duration: 200},
      ];

      const fcpTimeMs = 1500;
      const interactiveTimeMs = 2500;

      assert.equal(
        CumulativeLongQueuingDelay.calculateSumOfLongQueuingDelay(
          events, fcpTimeMs, interactiveTimeMs), 150);
    });

    it('clips queuing delay regions properly', () => {
      const fcpTimeMs = 1050;
      const interactiveTimeMs = 2050;

      const events = [
        {start: 1000, end: 1110, duration: 110}, // Contributes 10ms.
        {start: 2000, end: 2100, duration: 100}, // Contributes 50ms.
      ];


      assert.equal(
        CumulativeLongQueuingDelay.calculateSumOfLongQueuingDelay(
          events, fcpTimeMs, interactiveTimeMs), 60);
    });
  });
});
