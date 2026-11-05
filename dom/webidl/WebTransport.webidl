/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* https://w3c.github.io/webtransport */

/* https://w3c.github.io/webtransport/#web-transport-configuration */

dictionary WebTransportHash {
  required DOMString algorithm;
  required BufferSource value;
};

dictionary WebTransportOptions {
  boolean allowPooling = false;
  boolean requireUnreliable = false;
  sequence<WebTransportHash> serverCertificateHashes;
  WebTransportCongestionControl congestionControl = "default";
  sequence<DOMString> protocols = [];
  // The spec says "= {}", but the WebIDL parser cannot coerce {} to a union
  // containing a record.  See bug 2081884.
  HeadersInit headers;
  ReadableStreamType datagramsReadableType;
};

enum WebTransportCongestionControl {
  "default",
  "throughput",
  "low-latency",
};

/* https://w3c.github.io/webtransport/#web-transport-close-info */

dictionary WebTransportCloseInfo {
  unsigned long closeCode = 0;
  UTF8String reason = "";
};

/* https://w3c.github.io/webtransport/#send-options */
dictionary WebTransportSendOptions {
  WebTransportSendGroup? sendGroup = null;
  long long sendOrder = 0;
};

/* https://w3c.github.io/webtransport/#uni-stream-options */
dictionary WebTransportSendStreamOptions : WebTransportSendOptions {
};

/* https://w3c.github.io/webtransport/#web-transport-connection-stats */

dictionary WebTransportConnectionStats {
  unsigned long long bytesSent;
  unsigned long long bytesSentOverhead;
  unsigned long long bytesAcknowledged;
  unsigned long long packetsSent;
  unsigned long long bytesLost;
  unsigned long long packetsLost;
  unsigned long long bytesReceived;
  unsigned long long packetsReceived;
  DOMHighResTimeStamp smoothedRtt;
  DOMHighResTimeStamp rttVariation;
  DOMHighResTimeStamp minRtt;
  required WebTransportDatagramStats datagrams;
  unsigned long long? estimatedSendRate = null;
  boolean atSendCapacity = false;
};

/* https://w3c.github.io/webtransport/#web-transport-datagram-stats */

dictionary WebTransportDatagramStats {
  unsigned long long droppedIncoming;
  unsigned long long expiredIncoming;
  unsigned long long expiredOutgoing;
  unsigned long long lostOutgoing;
};

/* https://w3c.github.io/webtransport/#web-transport */

[Exposed=(Window,Worker), SecureContext, Pref="network.webtransport.enabled"]
interface WebTransport {
  [Throws]
  constructor(USVString url, optional WebTransportOptions options = {});

  [NewObject]
  Promise<WebTransportConnectionStats> getStats();
  [NewObject]
  Promise<Uint8Array> exportKeyingMaterial(BufferSource label,
                                            BufferSource context,
                                            unsigned long outputLength);
  readonly attribute Promise<undefined> ready;
  readonly attribute WebTransportReliabilityMode reliability;
  readonly attribute WebTransportCongestionControl congestionControl;
  [SameObject] readonly attribute Headers? responseHeaders;
  readonly attribute DOMString protocol;
  readonly attribute Promise<WebTransportCloseInfo> closed;
  readonly attribute Promise<undefined> draining;
  [Throws] undefined close(optional WebTransportCloseInfo closeInfo = {});

  [Throws] readonly attribute WebTransportDatagramDuplexStream datagrams;

  [NewObject]
  Promise<WebTransportBidirectionalStream> createBidirectionalStream(
     optional WebTransportSendStreamOptions options = {});
  /* a ReadableStream of WebTransportBidirectionalStream objects */
  readonly attribute ReadableStream incomingBidirectionalStreams;


  [NewObject]
  Promise<WebTransportSendStream> createUnidirectionalStream(
    optional WebTransportSendStreamOptions options = {});
  /* a ReadableStream of WebTransportReceiveStream objects */
  readonly attribute ReadableStream incomingUnidirectionalStreams;

  [NewObject, Throws]
  WebTransportSendGroup createSendGroup();

  static readonly attribute boolean supportsReliableOnly;
};

enum WebTransportReliabilityMode {
  "pending",
  "reliable-only",
  "supports-unreliable",
};
