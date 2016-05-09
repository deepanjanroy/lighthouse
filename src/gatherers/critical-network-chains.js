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

const Gather = require('./gather');
const childProcess = require('child_process');
const fs = require('fs');
const log = require('../lib/log.js');

const flatten = arr => arr.reduce((a, b) => a.concat(b), []);
const contains = (arr, elm) => arr.indexOf(elm) > -1;

class Node {
  get requestId() {
    return this.request.requestId;
  }
  constructor(request, parent) {
    this.children = [];
    this.parent = parent;
    this.request = request;
  }

  setParent(parentNode) {
    this.parent = parentNode;
  }

  addChild(childNode) {
    this.children.push(childNode);
  }

}

class CriticalNetworkChains extends Gather {

  get criticalPriorities() {
    // For now, critical request == render blocking request (as decided by
    // blink). Blink treats requests with the following priority levels as
    // render blocking.
    // See https://docs.google.com/document/d/1bCDuq9H1ih9iNjgzyAL0gpwNFiEP4TZS-YLRp_RuMlc
    return ['VeryHigh', 'High', 'Medium'];
  }

  postProfiling(options, tracingData) {
    const graph = this._getNetworkDependencyGraph(options.url, tracingData);
    const chains = this.getCriticalChains(tracingData.networkRecords, graph);

    // There logs are here so we can test this gatherer
    // Will be removed when we have a way to surface them in the report
    const nonTrivialChains = chains.filter(chain => chain.length > 1);

    // Note: Approximately,
    // startTime: time when request was dispatched
    // responseReceivedTime: either time to first byte, or time of receiving
    //  the end of response headers
    // endTime: time when response loading finished
    const debuggingData = nonTrivialChains.map(chain => ({
      urls: chain.map(request => request._url),
      totalRequests: chain.length,
      times: chain.map(request => ({
        startTime: request.startTime,
        endTime: request.endTime,
        responseReceivedTime: request.responseReceivedTime
      })),
      totalTimeBetweenBeginAndEnd:
        (chain[chain.length - 1].endTime - chain[0].startTime),
      totalLoadingTime: chain.reduce((acc, req) =>
        acc + (req.endTime - req.responseReceivedTime), 0)
    }));
    log.log('info', 'cricitalChains', JSON.stringify(debuggingData));
    return {CriticalNetworkChains: chains};
  }

  getCriticalChains(networkRecords, graph) {
    // TODO: Should we also throw out requests after DOMContentLoaded?
    const criticalRequests = networkRecords.filter(
      req => contains(this.criticalPriorities, req._initialPriority));

    // Build a map of requestID -> Node.
    const requestIdToNodes = new Map();
    for (let request of criticalRequests) {
      const requestNode = new Node(request, null);
      requestIdToNodes.set(requestNode.requestId, requestNode);
    }

    // Connect the parents and children.
    for (let edge of graph.edges) {
      const fromNode = graph.nodes[edge.__from_node_index];
      const toNode = graph.nodes[edge.__to_node_index];
      const fromRequestId = fromNode.request.request_id;
      const toRequestId = toNode.request.request_id;

      if (requestIdToNodes.has(fromRequestId) &&
          requestIdToNodes.has(toRequestId)) {
        const fromRequestNode = requestIdToNodes.get(fromRequestId);
        const toRequestNode = requestIdToNodes.get(toRequestId);

        fromRequestNode.addChild(toRequestNode);
        toRequestNode.setParent(fromRequestNode);
      }
    }

    const nodesList = [...requestIdToNodes.values()];
    const orphanNodes = nodesList.filter(node => node.parent === null);
    const nodeChains = flatten(orphanNodes.map(
      node => this._getChainsDFS(node)));
    const requestChains = nodeChains.map(chain => chain.map(
      node => node.request));
    return requestChains;
  }

  _getChainsDFS(startNode) {
    if (startNode.children.length === 0) {
      return [[startNode]];
    }

    const childrenChains = flatten(startNode.children.map(child =>
      this._getChainsDFS(child)));
    return childrenChains.map(chain => [startNode].concat(chain));
  }

  _saveClovisData(url, tracingData, filename) {
    const clovisData = {
      url: url,
      traceContents: tracingData.traceContents,
      frameLoadEvents: tracingData.frameLoadEvents,
      rawNetworkEvents: tracingData.rawNetworkEvents
    };
    fs.writeFileSync(filename, JSON.stringify(clovisData));
  }

  _getNetworkDependencyGraph(url, tracingData) {
    const clovisDataFilename = 'clovisData.json';
    const clovisGraphFilename = 'dependency-graph.json';

    // These will go away once we implement initiator graph ourselves
    this._saveClovisData(url, tracingData, clovisDataFilename);
    childProcess.execSync('python scripts/process_artifacts.py');
    childProcess.execSync('python scripts/netdep_graph_json.py', {stdio: [0, 1, 2]});
    const depGraphString = fs.readFileSync(clovisGraphFilename);

    try {
      fs.unlinkSync(clovisDataFilename);
      fs.unlinkSync(clovisGraphFilename);
    } catch (e) {
      console.error(e);
      // Should not halt lighthouse for a file delete error
    }

    return JSON.parse(depGraphString).graph;
  }
}

module.exports = CriticalNetworkChains;
