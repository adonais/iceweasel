/*
 *  Copyright 2026 The LibYuv Project Authors. All rights reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS. All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#include "libyuv/row.h"

#if !defined(LIBYUV_DISABLE_WASM) && defined(__wasm_simd128__)
#include <wasm_simd128.h>

#ifdef __cplusplus
namespace libyuv {
extern "C" {
#endif

#ifdef HAS_RAWTORGB24ROW_WASMSIMD
#ifdef __wasm_relaxed_simd__
#define LIBYUV_WASM_SWIZZLE wasm_i8x16_relaxed_swizzle
#else
#define LIBYUV_WASM_SWIZZLE wasm_i8x16_swizzle
#endif

static const uint8_t kRawToRGB24SwizzleTable[96] = {
    2,   1,   0,   5,   4,   3,   8,   7,   6,   11,  10,  9,   14,  13,  12,
    128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
    128, 1,   0,   128, 4,   3,   2,   7,   6,   5,   10,  9,   8,   13,  12,
    11,  128, 15,  128, 1,   128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
    128, 128, 2,   128, 128, 3,   2,   1,   6,   5,   4,   9,   8,   7,   12,
    11,  10,  15,  14,  13,  14,  128, 128, 128, 128, 128, 128, 128, 128, 128,
    128, 128, 128, 128, 128, 128};

void RAWToRGB24Row_WASMSIMD(const uint8_t* src_raw,
                            uint8_t* dst_rgb24,
                            int width) {
  const uint8_t* shuf = kRawToRGB24SwizzleTable;
  // Load shuffle masks into Wasm locals outside the loop so Binaryen's
  // precompute-propagate pass does not sink v128.const into the loop.
  asm("" : "+r"(shuf));
  v128_t kShuf0_0 = wasm_v128_load(shuf);
  v128_t kShuf0_1 = wasm_v128_load(shuf + 16);
  v128_t kShuf1_1 = wasm_v128_load(shuf + 32);
  v128_t kShuf1_02 = wasm_v128_load(shuf + 48);
  v128_t kShuf2_2 = wasm_v128_load(shuf + 64);
  v128_t kShuf2_1 = wasm_v128_load(shuf + 80);

  while (width >= 32) {
    // Prevent LLVM LSR from splitting constant load/store offsets into separate
    // pointer induction variables.
    asm("" : "+r"(src_raw), "+r"(dst_rgb24));
    v128_t s0 = wasm_v128_load(src_raw);
    v128_t s1 = wasm_v128_load(src_raw + 16);
    v128_t s2 = wasm_v128_load(src_raw + 32);
    v128_t s3 = wasm_v128_load(src_raw + 48);
    v128_t s4 = wasm_v128_load(src_raw + 64);
    v128_t s5 = wasm_v128_load(src_raw + 80);

    v128_t s02 = wasm_i8x16_shuffle(s0, s2, 14, 15, 16, 17, 18, 19, 20, 21, 22,
                                    23, 24, 25, 26, 27, 28, 29);
    v128_t s35 = wasm_i8x16_shuffle(s3, s5, 14, 15, 16, 17, 18, 19, 20, 21, 22,
                                    23, 24, 25, 26, 27, 28, 29);

    v128_t d0 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s0, kShuf0_0),
                             LIBYUV_WASM_SWIZZLE(s1, kShuf0_1));
    v128_t d1 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s1, kShuf1_1),
                             LIBYUV_WASM_SWIZZLE(s02, kShuf1_02));
    v128_t d2 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s2, kShuf2_2),
                             LIBYUV_WASM_SWIZZLE(s1, kShuf2_1));
    v128_t d3 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s3, kShuf0_0),
                             LIBYUV_WASM_SWIZZLE(s4, kShuf0_1));
    v128_t d4 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s4, kShuf1_1),
                             LIBYUV_WASM_SWIZZLE(s35, kShuf1_02));
    v128_t d5 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s5, kShuf2_2),
                             LIBYUV_WASM_SWIZZLE(s4, kShuf2_1));

    wasm_v128_store(dst_rgb24, d0);
    wasm_v128_store(dst_rgb24 + 16, d1);
    wasm_v128_store(dst_rgb24 + 32, d2);
    wasm_v128_store(dst_rgb24 + 48, d3);
    wasm_v128_store(dst_rgb24 + 64, d4);
    wasm_v128_store(dst_rgb24 + 80, d5);

    src_raw += 96;
    dst_rgb24 += 96;
    width -= 32;
  }
  if (width > 0) {
    asm("" : "+r"(src_raw), "+r"(dst_rgb24));
    v128_t s0 = wasm_v128_load(src_raw);
    v128_t s1 = wasm_v128_load(src_raw + 16);
    v128_t s2 = wasm_v128_load(src_raw + 32);

    v128_t s02 = wasm_i8x16_shuffle(s0, s2, 14, 15, 16, 17, 18, 19, 20, 21, 22,
                                    23, 24, 25, 26, 27, 28, 29);

    v128_t d0 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s0, kShuf0_0),
                             LIBYUV_WASM_SWIZZLE(s1, kShuf0_1));
    v128_t d1 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s1, kShuf1_1),
                             LIBYUV_WASM_SWIZZLE(s02, kShuf1_02));
    v128_t d2 = wasm_v128_or(LIBYUV_WASM_SWIZZLE(s2, kShuf2_2),
                             LIBYUV_WASM_SWIZZLE(s1, kShuf2_1));

    wasm_v128_store(dst_rgb24, d0);
    wasm_v128_store(dst_rgb24 + 16, d1);
    wasm_v128_store(dst_rgb24 + 32, d2);
  }
}
#undef LIBYUV_WASM_SWIZZLE
#endif  // HAS_RAWTORGB24ROW_WASMSIMD

#ifdef __cplusplus
}  // extern "C"
}  // namespace libyuv
#endif

#endif  // !defined(LIBYUV_DISABLE_WASM) && defined(__wasm_simd128__)
