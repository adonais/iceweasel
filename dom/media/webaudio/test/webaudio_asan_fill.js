/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Helpers for recognising ASan's allocator fill byte in Web Audio tests. */

"use strict";

// Keep these values in sync with build/sanitizers/AsanOptions.cpp.
const ASAN_EXPECTED_MALLOC_FILL_BYTE = 0xe4;
const ASAN_EXPECTED_MAX_MALLOC_FILL_SIZE = 268435456;

// Uint32Array reads unsigned values, so convert the byte tile to unsigned.
function asanTileByte(b) {
  return ((b << 24) | (b << 16) | (b << 8) | b) >>> 0;
}

const ASAN_EXPECTED_SENTINEL = asanTileByte(ASAN_EXPECTED_MALLOC_FILL_BYTE);

// Compiler-rt accepts colon, comma, and whitespace separators; the last value wins.
function asanParseOption(opts, key) {
  const sep = "[:\\s,]";
  const re = new RegExp(`(?:^|${sep})${key}=([^:\\s,]+)(?=${sep}|$)`, "g");
  return [...opts.matchAll(re)].at(-1)?.[1];
}

// Fail if ASAN_OPTIONS differs from the expected fill configuration.
function asanVerifyFillOptions() {
  const env = SpecialPowers.Services.env;
  const opts = env.exists("ASAN_OPTIONS") ? env.get("ASAN_OPTIONS") : "";
  const liveByte = asanParseOption(opts, "malloc_fill_byte");
  const liveSize = asanParseOption(opts, "max_malloc_fill_size");

  info(
    `Live ASAN_OPTIONS overrides: malloc_fill_byte=${liveByte} ` +
      `max_malloc_fill_size=${liveSize}; ` +
      `expected sentinel=0x${ASAN_EXPECTED_SENTINEL.toString(16)}`
  );

  if (
    liveByte !== undefined &&
    parseInt(liveByte, 10) !== ASAN_EXPECTED_MALLOC_FILL_BYTE
  ) {
    ok(
      false,
      `ASan malloc_fill_byte=${liveByte} on this worker differs from the ` +
        `value this test was written against ` +
        `(${ASAN_EXPECTED_MALLOC_FILL_BYTE}, per build/sanitizers/AsanOptions.cpp). ` +
        `Update ASAN_OPTIONS or both files in lockstep to re-align.`
    );
    return false;
  }
  if (
    liveSize !== undefined &&
    parseInt(liveSize, 10) !== ASAN_EXPECTED_MAX_MALLOC_FILL_SIZE
  ) {
    ok(
      false,
      `ASan max_malloc_fill_size=${liveSize} on this worker differs from the ` +
        `value this test was written against ` +
        `(${ASAN_EXPECTED_MAX_MALLOC_FILL_SIZE}, per build/sanitizers/AsanOptions.cpp). ` +
        `Update ASAN_OPTIONS or both files in lockstep to re-align.`
    );
    return false;
  }
  return true;
}

// Return the number and first index of ASan fill values in one channel.
function asanCountFillSentinel(channelData) {
  const u32 = new Uint32Array(
    channelData.buffer,
    channelData.byteOffset,
    channelData.length
  );
  let count = 0;
  let firstIndex = -1;
  for (let i = 0; i < u32.length; i++) {
    if (u32[i] === ASAN_EXPECTED_SENTINEL) {
      if (firstIndex < 0) {
        firstIndex = i;
      }
      count++;
    }
  }
  return { count, firstIndex };
}
