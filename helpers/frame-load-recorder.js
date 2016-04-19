/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const NetworkManager = require('./web-inspector').NetworkManager;

const REQUEST_FINISHED = NetworkManager.EventTypes.RequestFinished;

class FrameLoadRecorder {
  constructor() {
    this._events = [];

    this.onFrameStartedLoading = this.onFrameStartedLoading.bind(this);
    this.onFrameStoppedLoading = this.onFrameStoppedLoading.bind(this);
    this.onFrameAttached = this.onFrameAttached.bind(this);
  }

  getEvents() {
    return this._events;
  }

  // There are a few differences between the debugging protocol naming and
  // the parameter naming used in NetworkManager. These are noted below.

  onFrameStartedLoading(data) {
    // NOTE: data.timestamp -> time, data.type -> resourceType
    console.log("## DEEP debug data: ", data);
  }

  onFrameStoppedLoading(data) {
    // NOTE: data.timestamp -> time, data.type -> resourceType
    console.log("## DEEP debug data:", data);
  }

  onFrameAttached(data) {
    // NOTE: data.timestamp -> time, data.type -> resourceType
    console.log("## DEEP debug data:", data);
  }

}

module.exports = FrameLoadRecorder;
