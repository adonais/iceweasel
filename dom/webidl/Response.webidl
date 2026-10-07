/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://fetch.spec.whatwg.org/#response-class
 */

[Exposed=(Window,Worker)]
interface Response {
  [Throws]
  constructor(optional BodyInit? body = null,
              optional ResponseInit init = {});

  [NewObject] static Response error();
  [Throws,
   NewObject] static Response redirect(UTF8String url, optional unsigned short status = 302);
  [BinaryName=CreateFromJson, Throws,
   NewObject] static Response json(any data, optional ResponseInit init = {});

  readonly attribute ResponseType type;

  readonly attribute UTF8String url;
  readonly attribute boolean redirected;
  readonly attribute unsigned short status;
  readonly attribute boolean ok;
  readonly attribute ByteString statusText;
  [SameObject, BinaryName="headers_"] readonly attribute Headers headers;

  [Throws,
   NewObject] Response clone();

  [ChromeOnly, NewObject, Throws] Response cloneUnfiltered();

  // For testing only.
  [ChromeOnly] readonly attribute boolean hasCacheInfoChannel;
};
Response includes Body;

// This should be part of the Body mixin, but Request's copy is gated on
// dom.fetch.streaming_upload while this one ships unconditionally, so the two
// are declared separately. See Request.webidl.
partial interface Response {
  [GetterThrows]
  readonly attribute ReadableStream? body;
};

dictionary ResponseInit {
  unsigned short status = 200;
  ByteString statusText = "";
  HeadersInit headers;
};

enum ResponseType { "basic", "cors", "default", "error", "opaque", "opaqueredirect" };
