/*
 * Copyright 2023 Google LLC
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

#ifndef SkRectMemcpy_DEFINED
#define SkRectMemcpy_DEFINED

#if (_M_IX86_FP >= 1) || defined(__SSE__) || defined(_M_AMD64) || defined(__amd64__)
#include <xmmintrin.h>
#endif

#include "include/private/base/SkAssert.h"
#include "include/private/base/SkTemplates.h"

#include <cstring>

static inline void SkRectMemcpy(void* dst, size_t dstRB, const void* src, size_t srcRB,
                                size_t trimRowBytes, int rowCount) {
    SkASSERT(trimRowBytes <= dstRB);
    SkASSERT(trimRowBytes <= srcRB);
    if (trimRowBytes == dstRB && trimRowBytes == srcRB) {
        memcpy(dst, src, trimRowBytes * rowCount);
        return;
    }

    for (int i = 0; i < rowCount; ++i) {
        auto srcNext = SkTAddOffset<const void>(src, srcRB);
#if (_M_IX86_FP >= 1) || defined(__SSE__) || defined(_M_AMD64) || defined(__amd64__)
        if (i + 1 < rowCount) {
            _mm_prefetch((char *)srcNext, _MM_HINT_T0);
            _mm_prefetch((char *)srcNext + 64, _MM_HINT_T0);
        }
#endif
        memcpy(dst, src, trimRowBytes);
        dst = SkTAddOffset<void>(dst, dstRB);
        src = srcNext;
    }
}

#endif
