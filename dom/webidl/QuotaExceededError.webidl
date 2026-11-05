/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://webidl.spec.whatwg.org/#idl-DOMException-derived-predefineds
 */

[Exposed=*,
 Pref="dom.quota_exceeded_error.enabled",
 Serializable]
interface QuotaExceededError : DOMException {
  [Throws]
  constructor(optional DOMString message = "",
              optional QuotaExceededErrorOptions options = {});

  readonly attribute double? quota;
  readonly attribute double? requested;
};

dictionary QuotaExceededErrorOptions {
  double quota;
  double requested;
};
