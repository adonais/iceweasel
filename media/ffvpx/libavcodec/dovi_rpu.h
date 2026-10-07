/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Stubs for dovi_rpu.{c,h} */

#ifndef AVCODEC_DOVI_RPU_H
#define AVCODEC_DOVI_RPU_H

#include <stddef.h>
#include <stdint.h>

struct AVCodecContext;
struct AVCodecParameters;
struct AVFrame;

#define DOVI_MAX_DM_ID 15

enum {
    FF_DOVI_WRAP_NAL        = 1 << 0,
    FF_DOVI_WRAP_T35        = 1 << 1,
    FF_DOVI_COMPRESS_RPU    = 1 << 2,
};

enum AVDOVICompression {
    AV_DOVI_COMPRESSION_NONE     = 0,
    AV_DOVI_COMPRESSION_LIMITED  = 1,
    AV_DOVI_COMPRESSION_RESERVED = 2,
    AV_DOVI_COMPRESSION_EXTENDED = 3,
};

typedef struct AVDOVIDecoderConfigurationRecord {
    uint8_t dv_version_major;
    uint8_t dv_version_minor;
    uint8_t dv_profile;
    uint8_t dv_level;
    uint8_t rpu_present_flag;
    uint8_t el_present_flag;
    uint8_t bl_present_flag;
    uint8_t dv_bl_signal_compatibility_id;
    uint8_t dv_md_compression;
} AVDOVIDecoderConfigurationRecord;

typedef struct AVDOVIRpuDataHeader {
    uint8_t rpu_type;
    uint16_t rpu_format;
    uint8_t vdr_rpu_profile;
    uint8_t vdr_rpu_level;
    uint8_t chroma_resampling_explicit_filter_flag;
    uint8_t coef_data_type;
    uint8_t coef_log2_denom;
    uint8_t vdr_rpu_normalized_idc;
    uint8_t bl_video_full_range_flag;
    uint8_t bl_bit_depth;
    uint8_t el_bit_depth;
    uint8_t vdr_bit_depth;
    uint8_t spatial_resampling_filter_flag;
    uint8_t el_spatial_resampling_filter_flag;
    uint8_t disable_residual_flag;
    uint8_t ext_mapping_idc_0_4;
    uint8_t ext_mapping_idc_5_7;
} AVDOVIRpuDataHeader;

typedef struct AVDOVIMetadata AVDOVIMetadata;
typedef struct AVDOVIDataMapping AVDOVIDataMapping;
typedef struct AVDOVIColorMetadata AVDOVIColorMetadata;
typedef struct DOVIExt DOVIExt;

typedef struct DOVIContext {
    void *logctx;

#define FF_DOVI_AUTOMATIC -1
    int enable;

    AVDOVIDecoderConfigurationRecord cfg;
    AVDOVIRpuDataHeader header;

    const AVDOVIDataMapping *mapping;
    const AVDOVIColorMetadata *color;
    DOVIExt *ext_blocks;

    AVDOVIColorMetadata *dm;
    AVDOVIDataMapping *vdr[DOVI_MAX_DM_ID+1];
    uint8_t *rpu_buf;
    unsigned rpu_buf_sz;
} DOVIContext;

static inline void ff_dovi_ctx_replace(DOVIContext *s, const DOVIContext *s0) {
    (void)s; (void)s0;
}

static inline void ff_dovi_ctx_unref(DOVIContext *s) {
    (void)s;
}

static inline void ff_dovi_ctx_flush(DOVIContext *s) {
    (void)s;
}

static inline int ff_dovi_rpu_parse(DOVIContext *s, const uint8_t *rpu,
                                    size_t rpu_size, int err_recognition) {
    (void)s; (void)rpu; (void)rpu_size; (void)err_recognition;
    return 0;
}

static inline int ff_dovi_get_metadata(DOVIContext *s,
                                       AVDOVIMetadata **out_metadata) {
    (void)s; (void)out_metadata;
    return 0;
}

static inline int ff_dovi_attach_side_data(DOVIContext *s, struct AVFrame *frame) {
    (void)s; (void)frame;
    return 0;
}

static inline int ff_dovi_configure_from_codedpar(DOVIContext *s,
                                                   struct AVCodecParameters *codecpar,
                                                   const AVDOVIMetadata *metadata,
                                                   enum AVDOVICompression compression,
                                                   int strict_std_compliance) {
    (void)s; (void)codecpar; (void)metadata; (void)compression;
    (void)strict_std_compliance;
    return 0;
}

static inline int ff_dovi_configure(DOVIContext *s, struct AVCodecContext *avctx) {
    (void)s; (void)avctx;
    return 0;
}

static inline int ff_dovi_rpu_generate(DOVIContext *s,
                                       const AVDOVIMetadata *metadata,
                                       int flags, uint8_t **out_rpu,
                                       int *out_size) {
    (void)s; (void)metadata; (void)flags; (void)out_rpu; (void)out_size;
    return 0;
}

#endif /* AVCODEC_DOVI_RPU_H */
