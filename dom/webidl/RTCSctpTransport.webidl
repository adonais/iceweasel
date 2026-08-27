/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://w3c.github.io/webrtc-pc/#dom-rtcsctptransport
 */

enum RTCSctpTransportState {
  "connecting",
  "connected",
  "closed"
};

[Pref="media.peerconnection.enabled",
 Exposed=Window]
interface RTCSctpTransport : EventTarget {
  // Current spec does not make |transport| nullable, but that will change soon
  // See https://github.com/w3c/webrtc-pc/issues/3112 and
  // https://www.w3.org/2026/06/16-webrtc-minutes.html#2125
  readonly attribute RTCDtlsTransport? transport;
  readonly attribute RTCSctpTransportState state;
  readonly attribute unrestricted double? maxMessageSize;
  readonly attribute unsigned short? maxChannels;
  attribute EventHandler onstatechange;
};
