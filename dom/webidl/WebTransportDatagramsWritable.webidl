/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* https://w3c.github.io/webtransport/#datagram-writable */

// [Transferable] - See Bug 1562065
[Exposed=(Window,Worker), SecureContext, Pref="network.webtransport.enabled"]
interface WebTransportDatagramsWritable : WritableStream {
  [SetterThrows] attribute WebTransportSendGroup? sendGroup;
  attribute long long sendOrder;
};
