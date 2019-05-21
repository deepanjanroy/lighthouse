/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('../audit');
const i18n = require('../../lib/i18n/i18n.js');
const CumulativeLQD = require('../../computed/metrics/cumulative-long-queuing-delay.js');

const UIStrings = {
  title: 'Cumulative Long Queuing Delay',
  description: '[Experimental metric]. Sum of Task Lengths beyond 50ms, between ' +
      'First Contentful Paint and Time To Interactive.',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

class CumulativeLongQueuingDelay extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'cumulative-long-queuing-delay',
      title: str_(UIStrings.title),
      description: str_(UIStrings.description),
      scoreDisplayMode: Audit.SCORING_MODES.NUMERIC,
      requiredArtifacts: ['traces', 'devtoolsLogs'],
    };
  }

  /**
   * @return {LH.Audit.ScoreOptions}
   */
  static get defaultOptions() {
    return {
      // Generally, the scoreMedian and scorePODR value is set to be real world 25th/75th and
      // 5th/95th percentile value respectively. According to a cluster telemetry run over top 10k
      // sites on mobile, 25-th percentile was 270ms, 10-th percentile was 22ms, and 5th percentile
      // was 0ms. These numbers include 404 pages, so rounding up the scoreMedian to 300ms and
      // picking 25ms as PODR. See curve at https://www.desmos.com/calculator/x3nzenjyln
      scoreMedian: 300,
      scorePODR: 25,
    };
  }

  /**
   * Audits the page to calculate Cumulative Long Queuing Delay.
   *
   * We define Long Queuing Delay Region as any time interval in the loading timeline where queuing
   * time for an input event would be longer than 50ms. For example, if there is a 110ms main thread
   * task, the first 60ms of it is long queuing delay region, because any input event happening in
   * that time period has to wait more than 50ms. Cumulative Long Queuing Delay is the sum of all
   * Long Queuing Delay Regions between First Contentful Paint and Interactive Time (TTI).
   *
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts, context) {
    const trace = artifacts.traces[Audit.DEFAULT_PASS];
    const devtoolsLog = artifacts.devtoolsLogs[Audit.DEFAULT_PASS];
    const metricComputationData = {trace, devtoolsLog, settings: context.settings};
    const metricResult = await CumulativeLQD.request(metricComputationData, context);

    return {
      score: Audit.computeLogNormalScore(
        metricResult.timing,
        context.options.scorePODR,
        context.options.scoreMedian
      ),
      numericValue: metricResult.timing,
      displayValue: str_(i18n.UIStrings.ms, {timeInMs: metricResult.timing}),
    };
  }
}

module.exports = CumulativeLongQueuingDelay;
module.exports.UIStrings = UIStrings;
