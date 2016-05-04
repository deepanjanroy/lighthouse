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

const FMPMetric = require('../../metrics/first-meaningful-paint');
const Audit = require('../audit');

const flatten = arr => arr.reduce((a, b) => a.concat(b), []);

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

class OverdependentCriticalResources extends Audit {
  /**
   * @override
   */
  static get tags() {
    return ['Performance'];
  }

  /**
   * @override
   */
  static get name() {
    return 'overdependent-critical-resources';
  }

  /**
   * @override
   */
  static get description() {
    return 'Long chain of critical resources';
  }

  static _getChains(startNode) {
    if (startNode.children.length === 0) {
      return [[startNode]];
    } else {
      const childrenChains = flatten(startNode.children.map(child =>
        OverdependentCriticalResources._getChains(child)));
      return childrenChains.map(chain => [startNode].concat(chain));
    }
  }

  /**
   * Audits the page to see if there is a long chain of critical resource
   * dependency
   * @param {!Artifacts} artifacts The artifacts from the gather phase.
   * @return {!AuditResult} The score from the audit, ranging from 0-100.
   */
  static audit(artifacts) {
    const criticalPriorities = ['VeryHigh', 'High', 'Medium'];
    const criticalRequests = artifacts.networkRecords.filter(req =>
      criticalPriorities.indexOf(req._initialPriority) > -1
    );

    const graph = artifacts.networkDependencyGraph;
    const requestIdToNodes = new Map();
    for (let request of criticalRequests) {
      const requestId = request._requestId;
      const requestNode = new Node(requestId, null);
      requestIdToNodes.set(requestId, requestNode);
    }

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
      OverdependentCriticalResources._getChains(node)));

    const maxChainLength = Math.max(0, ...chains.map(chain => chain.length));

    // Returning random things + the chain. DO NOT SHIP.
    return Promise.resolve(OverdependentCriticalResources.generateAuditResult(
      maxChainLength, chains, "foo bar"));
  }
}

module.exports = OverdependentCriticalResources;
