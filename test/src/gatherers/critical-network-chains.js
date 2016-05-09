/**
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

const GathererClass = require('../../../src/gatherers/critical-network-chains');
const assert = require('assert');

const Gatherer = new GathererClass();

function mockTracingData(prioritiesList, edges) {
  const networkRecords = prioritiesList.map((priority, index) =>
      ({requestId: index, initialPriority: priority}));

  /* eslint-disable camelcase */
  const nodes = networkRecords.map(record =>
    ({request: {request_id: record._requestId}}));

  const graphEdges = edges.map(edge =>
    ({__from_node_index: edge[0], __to_node_index: edge[1]}));
  /* eslint-enable camelcase */

  return {
    networkRecords: networkRecords,
    graph: {
      nodes: nodes,
      edges: graphEdges
    }
  };
}

function testGetCriticalChain(data) {
  const mockData = mockTracingData(data.priorityList, data.edges);
  const criticalChains = Gatherer.getCriticalChains(
    mockData.networkRecords, mockData.graph);
  // It is sufficient to only check the requestIds are correct in the chain
  const requestIdChains = criticalChains.map(chain =>
    chain.map(node => node.requestId));
  // Ordering of the chains do not matter
  assert.deepEqual(new Set(requestIdChains), new Set(data.expectedChains));
}

const HIGH = 'High';
const VERY_HIGH = 'VeryHigh';
const MEDIUM = 'Medium';
const LOW = 'Low';
const VERY_LOW = 'VeryLow';

/* global describe, it*/
describe('CriticalNetworkChain gatherer: getCriticalChain function', () => {
  it('returns correct data for chain of four critical requests', () =>
    testGetCriticalChain({
      priorityList: [HIGH, MEDIUM, VERY_HIGH, HIGH],
      edges: [[0, 1], [1, 2], [2, 3]],
      expectedChains: [[0, 1, 2, 3]]
    }));

  it('returns correct data for chain interleaved with non-critical requests',
    () => testGetCriticalChain({
      priorityList: [MEDIUM, HIGH, LOW, MEDIUM, HIGH, VERY_LOW],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
      expectedChains: [[0, 1], [3, 4]]
    }));

  it('returns correct data for two parallel chains', () =>
    testGetCriticalChain({
      priorityList: [HIGH, HIGH, HIGH, HIGH],
      edges: [[0, 2], [1, 3]],
      expectedChains: [[1, 3], [0, 2]]
    }));

  it('returns correct data for fork at root', () =>
    testGetCriticalChain({
      priorityList: [HIGH, HIGH, HIGH],
      edges: [[0, 1], [0, 2]],
      expectedChains: [[0, 1], [0, 2]]
    }));

  it('returns correct data for fork at non root', () =>
    testGetCriticalChain({
      priorityList: [HIGH, HIGH, HIGH, HIGH],
      edges: [[0, 1], [1, 2], [1, 3]],
      expectedChains: [[0, 1, 2], [0, 1, 3]]
    }));

  it('returns empty chain list when no critical request', () =>
    testGetCriticalChain({
      priorityList: [LOW, LOW],
      edges: [[0, 1]],
      expectedChains: []
    }));

  it('returns empty chain list when no request whatsoever', () =>
    testGetCriticalChain({
      priorityList: [],
      edges: [],
      expectedChains: []
    }));

  it('returns two single node chains for two independent requests', () =>
    testGetCriticalChain({
      priorityList: [HIGH, HIGH],
      edges: [],
      expectedChains: [[0], [1]]
    }));

  it('returns correct data on a random big graph', () =>
    testGetCriticalChain({
      priorityList: Array(9).fill(HIGH),
      edges: [[0, 1], [1, 2], [1, 3], [4, 5], [5, 7], [7, 8], [5, 6]],
      expectedChains: [
        [0, 1, 2], [0, 1, 3], [4, 5, 7, 8], [4, 5, 6]
      ]}));
});
