/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Stubs for lcevcdec.{c,h} */
#ifndef AVCODEC_LCEVCDEC_H
#define AVCODEC_LCEVCDEC_H

#include "config_components.h"

#include <stdint.h>
typedef uintptr_t LCEVC_DecoderHandle;

typedef struct FFLCEVCContext {
    LCEVC_DecoderHandle decoder;
    int initialized;
} FFLCEVCContext;

struct AVFrame;

typedef struct FFLCEVCFrame {
    FFLCEVCContext *lcevc;
    struct AVFrame *frame;
} FFLCEVCFrame;

static inline int ff_lcevc_alloc(FFLCEVCContext **plcevc, int loglevel) {
    (void)plcevc; (void)loglevel;
    return 0;
}

static inline int ff_lcevc_process(void *logctx, struct AVFrame *frame) {
    (void)logctx; (void)frame;
    return 0;
}

static inline int ff_lcevc_parse_frame(FFLCEVCContext *lcevc,
                                       const struct AVFrame *frame,
                                       enum AVPixelFormat *format,
                                       int *width, int *height) {
    (void)lcevc; (void)frame; (void)format; (void)width; (void)height;
    return 0;
}

#endif /* AVCODEC_LCEVCDEC_H */
