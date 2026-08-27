/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://w3c.github.io/webrtc-pc/#dom-rtcerror
 */

enum RTCErrorDetailType {
  "data-channel-failure",
  "dtls-failure",
  "fingerprint-failure",
  "sctp-failure",
  "sdp-syntax-error",
  "hardware-encoder-not-available",
  "hardware-encoder-error"
};

// Current spec does not expose this on Worker, but that will change soon
// See https://github.com/w3c/webrtc-pc/issues/3092 and
// https://www.w3.org/2026/03/24-webrtc-minutes.html#51c7
[Pref="media.peerconnection.enabled",
 Exposed=(Window,DedicatedWorker)]
interface RTCError : DOMException {
  constructor(RTCErrorInit init, optional UTF8String message = "");
  readonly attribute RTCErrorDetailType errorDetail;
  readonly attribute long? sdpLineNumber;
  readonly attribute long? sctpCauseCode;
  readonly attribute unsigned long? receivedAlert;
  readonly attribute unsigned long? sentAlert;
};

dictionary RTCErrorInit {
  required RTCErrorDetailType errorDetail;
  long sdpLineNumber;
  long sctpCauseCode;
  unsigned long receivedAlert;
  unsigned long sentAlert;
};
