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

const Gather = require('../gather');

const flatten = arr => arr.reduce((a, b) => a.concat(b), []);
const contains = (arr, elm) => arr.indexOf(elm) > -1;

class Node {
  constructor(requestId, parent) {
    this.children = [];
    this.parent = null;
    this.requestId = requestId;
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

class CriticalNetworkRequestChains extends Gather {

  static _getChains(startNode) {
    // DFS-ish to get chains
    if (startNode.children.length === 0) {
      return [[startNode]];
    } else {
      const childrenChains = flatten(startNode.children.map(child =>
        CriticalNetworkRequestChains._getChains(child)));
      return childrenChains.map(chain => [startNode].concat(chain));
    }
  }

  get criticalPriorities() {
    return ['VeryHigh', 'High', 'Medium'];
  }

  /**
   * Audits the page to see if there is a long chain of critical resource
   * dependency
   */
  static postProfiling() {
    const criticalRequests = artifacts.networkRecords.filter(req =>
      contains(criticalPriorities, req));

    // Build a map of requestID -> Node.
    const graph = artifacts.networkDependencyGraph;
    const requestIdToNodes = new Map();
    for (let request of criticalRequests) {
      const requestId = request._requestId;
      const requestNode = new Node(requestId, null);
      requestIdToNodes.set(requestId, requestNode);
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
    const chains = flatten(orphanNodes.map(node =>
      CriticalNetworkRequestChains._getChains(node)));

    const maxChainLength = Math.max(0, ...chains.map(chain => chain.length));

    return Promise.resolve({CriticalNetworkRequestChains: chains});
    }));
  }
}

module.exports = CriticalNetworkRequestChains;
