/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 1994704 - avlguest.justice.nsw.gov.au test page does not load
 *
 * The page relies on non-standard mozRTCPeerConnection, which is no longer
 * needed. We can just set it to RTCPeerConnection.
 */

/* globals exportFunction */

console.info(
  "moz-prefixed JS APIs are being shimmed for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1994704 for details."
);

window.wrappedJSObject.mozRTCPeerConnection =
  window.wrappedJSObject.RTCPeerConnection;

window.wrappedJSObject.mozRTCSessionDescription =
  window.wrappedJSObject.RTCSessionDescription;

window.wrappedJSObject.mozRTCIceCandidate =
  window.wrappedJSObject.RTCIceCandidate;
