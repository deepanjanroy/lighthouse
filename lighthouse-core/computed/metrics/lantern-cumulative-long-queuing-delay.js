/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const makeComputedArtifact = require('../computed-artifact.js');
const LanternMetric = require('./lantern-metric.js');
const BaseNode = require('../../lib/dependency-graph/base-node.js');
const LanternFirstContentfulPaint = require('./lantern-first-contentful-paint.js');
const LanternInteractive = require('./lantern-interactive.js');

/** @typedef {BaseNode.Node} Node */

class LanternCumulativeLongQueuingDelay extends LanternMetric {
  /**
   * @return {LH.Gatherer.Simulation.MetricCoefficients}
   */
  static get COEFFICIENTS() {
    return {
      intercept: 0,
      optimistic: 0.5,
      pessimistic: 0.5,
    };
  }

  /**
   * @param {Node} dependencyGraph
   * @return {Node}
   */
  static getOptimisticGraph(dependencyGraph) {
    return dependencyGraph;
  }

  /**
   * @param {Node} dependencyGraph
   * @return {Node}
   */
  static getPessimisticGraph(dependencyGraph) {
    return dependencyGraph;
  }

  /**
   * @param {LH.Gatherer.Simulation.Result} simulation
   * @param {Object} extras
   * @return {LH.Gatherer.Simulation.Result}
   */
  static getEstimateFromSimulation(simulation, extras) {
    // Intentionally use the opposite FCP estimate, a more pessimistic FCP means that more tasks are
    // excluded from the CumulativeLongQueuingDelay computation, so a higher FCP means lower value
    // for the same work.
    const fcpTimeInMs = extras.optimistic
      ? extras.fcpResult.pessimisticEstimate.timeInMs
      : extras.fcpResult.optimisticEstimate.timeInMs;

    // Optimistic Interactive Time means less tasks were considered while counting
    // CumulativeLongQueuingDelay, which should result in a lower (better) value.
    const interactiveTimeMs = extras.optimistic
      ? extras.interactiveResult.optimisticEstimate.timeInMs
      : extras.interactiveResult.pessimisticEstimate.timeInMs;

    // Require here to resolve circular dependency.
    const CumulativeLongQueuingDelay = require('./cumulative-long-queuing-delay.js');
    const minDurationMs = CumulativeLongQueuingDelay.LONG_QUEUING_DELAY_THRESHOLD;

    const events = LanternCumulativeLongQueuingDelay.getTopLevelEvents(
      simulation.nodeTimings,
      minDurationMs
    );

    return {
      timeInMs: CumulativeLongQueuingDelay.calculateSumOfLongQueuingDelay(
        events,
        fcpTimeInMs,
        interactiveTimeMs
      ),
      nodeTimings: simulation.nodeTimings,
    };
  }

  /**
   * @param {LH.Artifacts.MetricComputationDataInput} data
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Artifacts.LanternMetric>}
   */
  static async compute_(data, context) {
    const fcpResult = await LanternFirstContentfulPaint.request(data, context);
    const interactiveResult = await LanternInteractive.request(data, context);
    return this.computeMetricWithGraphs(data, context, {fcpResult, interactiveResult});
  }

  /**
   * @param {LH.Gatherer.Simulation.Result['nodeTimings']} nodeTimings
   * @param {number} minDurationMs
   */
  static getTopLevelEvents(nodeTimings, minDurationMs) {
    /** @type {Array<{start: number, end: number, duration: number}>}
     */
    const events = [];

    for (const [node, timing] of nodeTimings.entries()) {
      if (node.type !== BaseNode.TYPES.CPU) continue;
      // Filtering out events below minimum duration to avoid unnecessary sorting work later.
      if (timing.duration < minDurationMs) continue;

      events.push({
        start: timing.startTime,
        end: timing.endTime,
        duration: timing.duration,
      });
    }

    return events.sort((a, b) => a.start - b.start);
  }
}

module.exports = makeComputedArtifact(LanternCumulativeLongQueuingDelay);
