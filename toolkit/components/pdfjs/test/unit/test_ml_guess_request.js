/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { validateMLGuessRequest } = ChromeUtils.importESModule(
  "resource://pdf.js/PdfJsParent.sys.mjs"
);

// Build a request with the viewer's four pixel fields.
function pixels({ width = 2, height = 2, channels = 4, ...rest } = {}) {
  return {
    data: new Uint8ClampedArray(width * height * channels),
    width,
    height,
    channels,
    ...rest,
  };
}

const label = v => (typeof v === "string" ? `"${v}"` : String(v));

add_task(function test_rejects_non_objects() {
  for (const request of [null, undefined, "", "data", 42, true, () => {}]) {
    Assert.equal(
      validateMLGuessRequest(request),
      false,
      `${label(request)} must be rejected`
    );
  }
  Assert.equal(validateMLGuessRequest({}), false, "empty object");
  Assert.equal(validateMLGuessRequest([1, 2, 3, 4]), false, "array");
});

// The image-to-text pipeline passes `request.url` to `RawImage.fromURL()`.
add_task(function test_rejects_url_requests() {
  Assert.equal(
    validateMLGuessRequest({ url: "file:///etc/passwd" }),
    false,
    "bare url request"
  );
  Assert.equal(
    validateMLGuessRequest(pixels({ url: "file:///etc/passwd" })),
    false,
    "url smuggled next to a well-formed payload"
  );
  const swapped = pixels({ url: "file:///etc/passwd" });
  delete swapped.channels;
  Assert.equal(
    validateMLGuessRequest(swapped),
    false,
    "url in place of an expected property (right number of keys)"
  );
});

add_task(function test_rejects_unknown_properties() {
  Assert.equal(
    validateMLGuessRequest(pixels({ options: { streamer: null } })),
    false,
    "extra property"
  );
  for (const key of ["data", "width", "height", "channels"]) {
    const request = pixels();
    delete request[key];
    Assert.equal(
      validateMLGuessRequest(request),
      false,
      `missing ${key} must be rejected`
    );
  }
});

add_task(function test_rejects_bad_data() {
  for (const data of [
    undefined,
    null,
    "AAAA",
    [0, 0, 0, 0],
    new ArrayBuffer(16),
    new Uint16Array(16),
    new Float32Array(16),
  ]) {
    Assert.equal(
      validateMLGuessRequest(pixels({ data })),
      false,
      `data ${data?.constructor?.name ?? label(data)} must be rejected`
    );
  }
});

add_task(function test_rejects_bad_dimensions() {
  for (const value of [
    0,
    -1,
    -2048,
    1.5,
    NaN,
    Infinity,
    "2",
    null,
    undefined,
  ]) {
    Assert.equal(
      validateMLGuessRequest({ ...pixels(), width: value }),
      false,
      `width ${label(value)} must be rejected`
    );
    Assert.equal(
      validateMLGuessRequest({ ...pixels(), height: value }),
      false,
      `height ${label(value)} must be rejected`
    );
  }
});

add_task(function test_rejects_bad_channels() {
  for (const channels of [0, -1, 5, 2.5, NaN, "4", null, undefined]) {
    Assert.equal(
      validateMLGuessRequest({ ...pixels(), channels }),
      false,
      `channels ${label(channels)} must be rejected`
    );
  }
});

// The data length must match the geometry passed to RawImage.
add_task(function test_rejects_inconsistent_geometry() {
  Assert.equal(
    validateMLGuessRequest({ ...pixels(), data: new Uint8ClampedArray(15) }),
    false,
    "data shorter than the geometry"
  );
  Assert.equal(
    validateMLGuessRequest({ ...pixels(), data: new Uint8ClampedArray(17) }),
    false,
    "data longer than the geometry"
  );
  Assert.equal(
    validateMLGuessRequest({ ...pixels(), width: 4 }),
    false,
    "geometry wider than data"
  );
  Assert.equal(
    validateMLGuessRequest({ ...pixels(), data: new Uint8ClampedArray(0) }),
    false,
    "empty data"
  );
  Assert.equal(
    validateMLGuessRequest({ ...pixels(), width: 2 ** 32, height: 2 ** 32 }),
    false,
    "huge geometry"
  );
});

add_task(function test_accepts_viewer_payload() {
  Assert.equal(
    validateMLGuessRequest(pixels()),
    true,
    "2x2 RGBA ImageData (Uint8ClampedArray, as canvas produces)"
  );
  Assert.equal(
    validateMLGuessRequest({
      data: new Uint8Array(4),
      width: 2,
      height: 2,
      channels: 1,
    }),
    true,
    "2x2 grayscale Uint8Array"
  );
  Assert.equal(
    validateMLGuessRequest(pixels({ width: 1, height: 1 })),
    true,
    "single pixel"
  );
  Assert.equal(
    validateMLGuessRequest(pixels({ width: 1024, height: 768 })),
    true,
    "larger RGBA payload"
  );
});
