/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bugs 1938533 - ChatGPT voice mode does not always work.
 *
 * ChatGPT voice seems to be relying on peer reflexive candidates. It
 * isn't giving Firefox any STUN/TURN servers in the RTCPeerConnection
 * config which is a bit unusual. The following works around the issue.
 */

/* globals exportFunction */

console.info(
  "RTCPeerConnection is being shimmed for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=1938533 for details."
);

const win = window.wrappedJSObject;
const origRTCPeerConnection = win.RTCPeerConnection;
win.RTCPeerConnection = exportFunction(function (cfg = {}) {
  const extra = [{ urls: "stun:stun.l.google.com:19302" }];
  const merged = { ...cfg, iceServers: [...(cfg.iceServers || []), ...extra] };
  const pc = new origRTCPeerConnection(merged);
  pc.addEventListener("icecandidateerror", e => console.warn("ICE error", e));
  pc.addEventListener("iceconnectionstatechange", () =>
    console.log("iceConnectionState", pc.iceConnectionState)
  );
  return pc;
}, window);
win.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;
