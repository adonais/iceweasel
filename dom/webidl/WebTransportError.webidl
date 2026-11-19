/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* https://w3c.github.io/webtransport/#web-transport-error-interface */

[Exposed=(Window,Worker), Serializable, SecureContext,
 Pref="network.webtransport.enabled"]
interface WebTransportError : DOMException {
  // WebTransportErrorInit is the older constructor signature, still used by
  // upstream WPTs.
  constructor(optional (DOMString or WebTransportErrorInit) message = "",
              optional WebTransportErrorOptions options = {});

  readonly attribute WebTransportErrorSource source;
  readonly attribute unsigned long? streamErrorCode;
};

dictionary WebTransportErrorOptions {
  WebTransportErrorSource source = "stream";
  [Clamp] unsigned long? streamErrorCode = null;
};

dictionary WebTransportErrorInit {
  [Clamp] unsigned long streamErrorCode;
  DOMString message = "";
};

enum WebTransportErrorSource {
  "stream",
  "session",
};
