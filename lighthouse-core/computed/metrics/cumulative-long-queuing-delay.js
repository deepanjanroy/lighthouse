/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
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
 * @fileoverview This audit determines Cumulative Long Queuing Delay between FCP and TTI.

 * We define Long Queuing Delay Region as any time interval in the loading timeline where queuing
 * time for an input event would be longer than 50ms. For example, if there is a 250ms main thread
 * task, the first 200ms of it is long queuing delay region, because any input event happening in
 * that time period has to wait more than 50ms. Cumulative Long Queuing Delay is the sum of all Long
 * Queuing Delay Regions between First Contentful Paint and Interactive Time (TTI).
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
    // First identifying the long queuing delay regions.
    for (const event of topLevelEvents) {
      // If the task is less than the delay threshold, it contains no long queuing delay region.
      if (event.duration < threshold) continue;
      // Otherwise, the duration of the task except the delay-threshold-sized interval at the end is
      // considered long queuing delay region. Example assuming the threshold is 50ms:
      //   [              250ms Task                   ]
      //   |  Long Queuing Delay Region  |   Last 50ms |
      //               200 ms
      longQueuingDelayRegions.push({
        start: event.start,
        end: event.end - threshold,
        duration: event.duration - threshold,
      });
    }

    let sumLongQueuingDelay = 0;
    for (const region of longQueuingDelayRegions) {
      // We only want to add up the Long Queuing Delay regions that fall between FCP and TTI.
      //
      // FCP is picked as the lower bound because there is little risk of user input happening
      // before FCP so Long Queuing Qelay regions do not harm user experience. Developers should be
      // optimizing to reach FCP as fast as possible without having to worry about task lengths.
      //
      // TTI is picked as the upper bound because we want a well defined end point so that the
      // metric does not rely on how long we trace. There is very low probability of encountering a
      // Long Queuing Delay region past TTI.
      if (region.end < fcpTimeInMs) continue;
      if (region.start > interactiveTimeMs) continue;

      // If a Long Queuing Delay Region spans the edges of our region of interest, we clip it to
      // only include the part of the region that falls inside.
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
  static async computeObservedMetric(data, context) {
    const {firstContentfulPaint} = data.traceOfTab.timings;
    if (!firstContentfulPaint) {
      throw new LHError(LHError.errors.NO_FCP);
    }

    const interactiveTimeMs = (await TimetoInteractive.request(data, context)).timing;

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
  }
}

module.exports = makeComputedArtifact(CumulativeLongQueuingDelay);
