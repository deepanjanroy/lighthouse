/**
 * @license
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

class GatherScheduler {

  static _runPhase(gatherers, gatherFun) {
    return gatherers.reduce(
      (chain, gatherer) => chain.then(_ => gatherFun(gatherer)),
      Promise.resolve()
    );
  }

  static run(gatherers, options) {
    const driver = options.driver;
    const url = options.url;
    const loadPage = options.flags.loadPage;
    const emulateMobileDevice = options.flags.mobile;
    const tracingData = {};
    const artifacts = [];

    if (url === undefined || url === null) {
      throw new Error('You must provide a url to scheduler');
    }

    return driver.connect()

      // Enable emulation.
      .then(_ => {
        if (emulateMobileDevice) {
          return driver.beginEmulation();
        }

        return Promise.resolve();
      })

      // Clean all browser caches.
      .then(_ => driver.cleanAndDisableBrowserCaches())

      // Force SWs to update on load.
      .then(_ => driver.forceUpdateServiceWorkers())

      // Gather: setup phase.
      .then(_ => this._runPhase(gatherers,
          gatherer => gatherer.setup(options)))

      // Enable tracing and network record collection.
      .then(_ => driver.beginFrameLoadCollect())
      .then(_ => driver.beginTrace())
      .then(_ => driver.beginNetworkCollect())

      // Gather: beforePageLoad phase.
      .then(_ => this._runPhase(gatherers,
          gatherer => gatherer.beforePageLoad(options)))

      // Load the page (if the CLI / extension want it loaded).
      .then(_ => {
        if (loadPage) {
          return driver.gotoURL(url, driver.WAIT_FOR_LOADED);
        }

        return Promise.resolve();
      })

      // Gather: afterPageLoad phase
      .then(_ => this._runPhase(gatherers,
          gatherer => gatherer.afterPageLoad(options)))

      // Disable network collection; grab records.
      .then(_ => driver.endNetworkCollect())
      .then(networkRecords => {
        tracingData.networkRecords = networkRecords;
      })

      // Disable tracing; grab records.
      .then(_ => driver.endTrace())
      .then(traceContents => {
        tracingData.traceContents = traceContents;
      })
      .then(_ => driver.endFrameLoadCollect())

      // Gather: afterTraceCollected phase.
      .then(_ => this._runPhase(gatherers,
          gatherer => gatherer.afterTraceCollected(options, tracingData)))

      // Disconnect the driver.
      .then(_ => driver.disconnect())

      // Gather: tearDown phase.
      .then(_ => this._runPhase(gatherers,
        gatherer => gatherer.tearDown(options, tracingData)))

      // Collate all the gatherer results.
      .then(_ => {
        artifacts.push(...gatherers.map(g => g.artifact));
        // debug
        const fs = require('fs');
        artifacts.push(
          {networkRecords: tracingData.networkRecords},
          {traceContents: tracingData.traceContents}
        );
        const clovisTracks = {};
        // TODO: do not depend on url being the first artifact
        clovisTracks.url = artifacts[0]['url'];
        clovisTracks.tracing_track = { events: artifacts[artifacts.length - 1]['traceContents'] };

        function replaceKey(obj, oldKey, newKey) {
          if (obj[oldKey] !== undefined) {
            obj[newKey] = obj[oldKey];
            delete obj[oldKey];
          }
        }

        const requestTrackEvents = tracingData.networkRecords.map(rec => {
          const event = Object.assign({}, rec);
          replaceKey(event, '_documentURL', 'document_url');
          replaceKey(event, '_frameId', 'frame_id');
          replaceKey(event, '_initialPriority', 'initial_priority');
          replaceKey(event, '_loaderId', 'loader_id');
          replaceKey(event, '_mimeType', 'mime_type');
          replaceKey(event, '_requestHeaders', 'request_headers');
          replaceKey(event, '_requestId', 'request_id');
          replaceKey(event, '_resourceType', 'resource_type');
          replaceKey(event, '_responseHeaders', 'response_headers');

          for (let key of Object.keys(event)) {
            if (key.length > 1 && key[0] === '_' && key[1] !== '_') {
              replaceKey(event, key, key.substring(1));
            }
          }
          return event;
        });
        clovisTracks.request_track = { 
          events: requestTrackEvents,
          metadata: {
            // duplicates_count: 0,
            // inconsistent_initiators: 0
          }
        };
        clovisTracks.page_track = [];
        clovisTracks.metadata = {};
        fs.writeFileSync("artifacts.log", JSON.stringify(artifacts));
        fs.writeFileSync("clovis.log", JSON.stringify(clovisTracks));
      })
      .then(_ => artifacts);
  }
}

module.exports = GatherScheduler;
