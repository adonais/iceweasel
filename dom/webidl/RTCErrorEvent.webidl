/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://w3c.github.io/webrtc-pc/#dom-rtcerrorevent
 */

// Current spec does not expose this on Worker, but that will change soon
// See https://github.com/w3c/webrtc-pc/issues/3092 and
// https://www.w3.org/2026/03/24-webrtc-minutes.html#51c7
[Pref="media.peerconnection.enabled",
 Exposed=(Window,DedicatedWorker)]
interface RTCErrorEvent : Event {
  constructor(DOMString type, RTCErrorEventInit eventInitDict);
  [SameObject] readonly attribute RTCError error;
};

dictionary RTCErrorEventInit : EventInit {
  required RTCError error;
};
