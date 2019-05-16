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
      // According to a cluster telemetry run over top 10k sites on mobile,
      // median was 894ms, and 27% of the sites had metric value lower than
      // 300ms, including 404 pages.
      // In this settings, anything below 200ms will receive a score of 1.
      // See curve at https://www.desmos.com/calculator/y3ntlqoxdz
      scorePODR: 300,
      scoreMedian: 900,
    };
  }

  /**
   * Audits the page to estimate input latency.
   * @see https://github.com/GoogleChrome/lighthouse/issues/28
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
