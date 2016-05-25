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

const includes = (arr, elm) => arr.indexOf(elm) > -1;

class CriticalNetworkChains extends Gather {

  /** @return {String} */
  get criticalPriorities() {
    // For now, critical request == render blocking request (as decided by
    // blink). Blink treats requests with the following priority levels as
    // render blocking.
    // See https://docs.google.com/document/d/1bCDuq9H1ih9iNjgzyAL0gpwNFiEP4TZS-YLRp_RuMlc
    return ['VeryHigh', 'High', 'Medium'];
  }

  postProfiling(options, tracingData) {
    const networkRecords = tracingData.networkRecords;

    // Get all the critical requests.
    /** @type {!Array<NetworkRequest>} */
    const criticalRequests = networkRecords.filter(
      req => includes(this.criticalPriorities, req.initialPriority()));

    // Build a map of requestID -> Node.
    const requestIdToRequests = new Map();
    for (let request of criticalRequests) {
      requestIdToRequests.set(request.requestId, request);
    }

    const flattenRequest = request => {
      return {
        url: request._url,
        startTime: request.startTime,
        endTime: request.endTime,
        responseReceivedTime: request.responseReceivedTime
      };
    };

    // Create a tree of critical requests.
    const criticalNetworkChains = {};
    for (let request of criticalRequests) {
      // Work back from this request up to the root. If by some weird quirk we are giving request D
      // here, which has ancestors C, B and A (where A is the root), we will build array [C, B, A]
      // during this phase.
      const ancestors = [];
      let ancestorRequest = request.initiatorRequest();
      let node = criticalNetworkChains;
      while (ancestorRequest) {
        // If the parent request isn't a high priority request it won't be in the
        // requestIdToRequests map, and so we can break the chain here.
        // TODO(paullewis): Check that it's valid to break the chain.
        const hasAncestorRequest = requestIdToRequests.has(ancestorRequest.requestId);

        if (!hasAncestorRequest) {
          // Set the ancestors to an empty array and unset node so that we don't add
          // the request in to the tree.
          ancestors.length = 0;
          node = undefined;
          break;
        }
        ancestors.push(ancestorRequest.requestId);
        ancestorRequest = ancestorRequest.initiatorRequest();
      }

      // With the above array we can work from back to front, i.e. A, B, C, and during this process
      // we can build out the tree for any nodes that have yet to be created.
      let ancestor = ancestors.pop();
      while (ancestor) {
        const parentRequest = requestIdToRequests.get(ancestor);
        const parentRequestId = parentRequest.requestId;
        if (!node[parentRequestId]) {
          node[parentRequestId] = {
            request: flattenRequest(parentRequest),
            children: {}
          };
        }

        // Step to the next iteration.
        ancestor = ancestors.pop();
        node = node[parentRequestId].children;
      }

      if (!node) {
        continue;
      }

      // node should now point to the immediate parent for this request.
      node[request.requestId] = {
        request: flattenRequest(request),
        children: {}
      };
    }

    this.artifact = {
      criticalNetworkChains
    };
  }
}

module.exports = CriticalNetworkChains;
