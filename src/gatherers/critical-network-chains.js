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
const child_process = require('child_process');
const fs = require('fs');
const log = require('../lib/log.js');

const flatten = arr => arr.reduce((a, b) => a.concat(b), []);
const contains = (arr, elm) => arr.indexOf(elm) > -1;

class Node {
  get requestId() {
    return this.request._requestId;
  }
  constructor(request, parent) {
    this.children = [];
    this.parent = null;
    this.request = request;
  }

  setParent(parentNode) {
    this.parent = parentNode;
  }

  addChild(childNode) {
    this.children.push(childNode);
  }

  toJSON() {
    return "{requestId: " + this.requestId + ", parent: " + (this.parent && this.parent.requestId) + "}";
  }
}

class CriticalNetworkChains extends Gather {

  get criticalPriorities() {
    return ['VeryHigh', 'High', 'Medium'];
  }

  postProfiling(options, tracingData) {
    const graph = this._getNetworkDependencyGraph(options.url, tracingData);
    const chains = this.getCriticalChains(tracingData.networkRecords, graph);

    // There logs are here so we can test this gatherer
    // Will be removed when we can a way to surface them in the report
    const urlChains = chains.map(chain => chain.map(request => request._url));
    const debuggingData = chains.map(chain => ({
      urls: chain.map(request => request._url),
      totalRequests: chain.length,
      times: chain.map(request => ({
        startTime: request._startTime,
        endTime: request._endTime,
        responseReceivedTime: request.responseReceivedTime
      })),
      // TODO: what happens with long polling? is endTime infinite?
      totalTimeSpent: chain.reduce(
        (sum, req) => sum + (req._endTime - req._startTime), 0)
    }));
    log.log('info', JSON.stringify(debuggingData));
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
    } else {
      const childrenChains = flatten(startNode.children.map(child =>
        this._getChainsDFS(child)));
      return childrenChains.map(chain => [startNode].concat(chain));
    }
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
    const clovisDataFilename = "clovisData.json";
    const clovisGraphFilename = "dependency-graph.json";

    // These will go away once we implement initiator graph ourselves
    this._saveClovisData(url, tracingData, clovisDataFilename);
    child_process.execSync('python scripts/process_artifacts.py');
    child_process.execSync('python scripts/netdep_graph_json.py');
    const depGraphString = fs.readFileSync(clovisGraphFilename);

    // TODO: make sure non existent files do not bring whole lighthouse down
    fs.unlinkSync(clovisDataFilename);
    fs.unlinkSync(clovisGraphFilename);

    return JSON.parse(depGraphString).graph;
  }
}

module.exports = CriticalNetworkChains;
