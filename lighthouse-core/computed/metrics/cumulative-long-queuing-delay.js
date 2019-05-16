/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const makeComputedArtifact = require('../computed-artifact.js');
const ComputedMetric = require('./metric.js');
const LHError = require('../../lib/lh-error.js');
const TracingProcessor = require('../../lib/traces/tracing-processor.js');
const LanternCumulativeLongQueuingDelay = require('./lantern-cumulative-long-queuing-delay.js');
const TimetoInteractive = require('./interactive.js');

/**
 * @fileoverview This audit determines the largest 90 percentile EQT value of all 5s windows between
 *    FMP and the end of the trace.
 * @see https://docs.google.com/document/d/1b9slyaB9yho91YTOkAQfpCdULFkZM9LqsipcX3t7He8/preview
 */
class CumulativeLongQueuingDelay extends ComputedMetric {
  /**
   * @return {number}
   */
  static get LONG_QUEUING_DELAY_THRESHOLD() {
    return 50;
  }
  /**
   * @param {Array<{start: number, end: number, duration: number}>} topLevelEvents
   * @param {number} fcpTimeInMs
   * @param {number} interactiveTimeMs
   * @return {number}
   */
  static calculateSumOfLongQueuingDelay(topLevelEvents, fcpTimeInMs, interactiveTimeMs) {
    const threshold = CumulativeLongQueuingDelay.LONG_QUEUING_DELAY_THRESHOLD;
    const longQueuingDelayRegions = [];
    // [              250ms Task                   ]
    // |  Long Queuing Delay Region  |   Last 50ms |
    //           200 ms
    for (const event of topLevelEvents) {
      if (event.duration < threshold) continue;
      longQueuingDelayRegions.push({
        start: event.start,
        end: event.end - threshold,
        duration: event.duration - threshold,
      });
    }

    let sumLongQueuingDelay = 0;
    for (const region of longQueuingDelayRegions) {
      if (region.end < fcpTimeInMs) continue;
      if (region.start > interactiveTimeMs) continue;
      const clippedStart = Math.max(region.start, fcpTimeInMs);
      const clippedEnd = Math.min(region.end, interactiveTimeMs);
      const queuingDelayAfterClipping = clippedEnd - clippedStart;
      sumLongQueuingDelay += queuingDelayAfterClipping;
    }

    return sumLongQueuingDelay;
  }

  /**
   * @param {LH.Artifacts.MetricComputationData} data
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Artifacts.LanternMetric>}
   */
  static computeSimulatedMetric(data, context) {
    return LanternCumulativeLongQueuingDelay.request(data, context);
  }

  /**
   * @param {LH.Artifacts.MetricComputationData} data
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Artifacts.Metric>}
   */
  static computeObservedMetric(data, context) {
    const {firstContentfulPaint} = data.traceOfTab.timings;
    if (!firstContentfulPaint) {
      throw new LHError(LHError.errors.NO_FCP);
    }

    return TimetoInteractive.request(data, context).then(artifact => {
      const interactiveTimeMs = artifact.timing;
      // Not using the start time argument of getMainThreadTopLevelEvents, because
      // we need to clip the part of the task before the last 50ms properly.
      const events = TracingProcessor.getMainThreadTopLevelEvents(data.traceOfTab);

      return {
        timing: CumulativeLongQueuingDelay.calculateSumOfLongQueuingDelay(
          events,
          firstContentfulPaint,
          interactiveTimeMs
        ),
      };
    });
  }
}

module.exports = makeComputedArtifact(CumulativeLongQueuingDelay);
