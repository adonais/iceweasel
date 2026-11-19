/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

#ifndef DWRITE_EXTRA_H
#define DWRITE_EXTRA_H

#include <dwrite_3.h>

/* Upstream's Meson build probes for IDWriteFactory8. Instead, detect it from
 * the marker that SDK and mingw-w64 headers define along with it, under the
 * same NTDDI_VERSION guard that the SDK puts around the declarations. */
#if !defined(HAVE_IDWRITEFACTORY8) && \
    defined(DWRITE_GLYPH_IMAGE_FORMATS_COLR_PAINT_TREE_DEFINED) && \
    (defined(__MINGW32__) || \
     (defined(NTDDI_WIN10_CU) ? NTDDI_VERSION >= NTDDI_WIN10_CU \
                              : NTDDI_VERSION >= NTDDI_WIN10_NI))
#define HAVE_IDWRITEFACTORY8 1
#endif

typedef enum DWRITE_GLYPH_IMAGE_FORMATS_ {
    DWRITE_GLYPH_IMAGE_FORMATS_NONE_ = 0,
    DWRITE_GLYPH_IMAGE_FORMATS_TRUETYPE_ = 1 << 0,
    DWRITE_GLYPH_IMAGE_FORMATS_CFF_ = 1 << 1,
    DWRITE_GLYPH_IMAGE_FORMATS_COLR_ = 1 << 2,
    DWRITE_GLYPH_IMAGE_FORMATS_SVG_ = 1 << 3,
    DWRITE_GLYPH_IMAGE_FORMATS_PNG_ = 1 << 4,
    DWRITE_GLYPH_IMAGE_FORMATS_JPEG_ = 1 << 5,
    DWRITE_GLYPH_IMAGE_FORMATS_TIFF_ = 1 << 6,
    DWRITE_GLYPH_IMAGE_FORMATS_PREMULTIPLIED_B8G8R8A8_ = 1 << 7,
    DWRITE_GLYPH_IMAGE_FORMATS_COLR_PAINT_TREE_ = 1 << 8
} DWRITE_GLYPH_IMAGE_FORMATS_;
DEFINE_ENUM_FLAG_OPERATORS(DWRITE_GLYPH_IMAGE_FORMATS_)

#ifndef HAVE_IDWRITEFACTORY8

typedef enum DWRITE_PAINT_FEATURE_LEVEL {
    DWRITE_PAINT_FEATURE_LEVEL_NONE = 0,
    DWRITE_PAINT_FEATURE_LEVEL_COLR_V0 = 1,
    DWRITE_PAINT_FEATURE_LEVEL_COLR_V1 = 2
} DWRITE_PAINT_FEATURE_LEVEL;

DEFINE_GUID(IID_IDWriteFactory8, 0xee0a7fb5, 0xdef4, 0x4c23, 0xa4,0x54, 0xc9,0xc7,0xdc,0x87,0x83,0x98);
MIDL_INTERFACE("ee0a7fb5-def4-4c23-a454-c9c7dc878398")
IDWriteFactory8 : public IDWriteFactory7
{
    virtual HRESULT STDMETHODCALLTYPE TranslateColorGlyphRun(
        D2D1_POINT_2F origin,
        const DWRITE_GLYPH_RUN *glyph_run,
        const DWRITE_GLYPH_RUN_DESCRIPTION *glyph_run_desc,
        DWRITE_GLYPH_IMAGE_FORMATS image_formats,
        DWRITE_PAINT_FEATURE_LEVEL feature_level,
        DWRITE_MEASURING_MODE measuring_mode,
        const DWRITE_MATRIX *world_and_dpi_transform,
        UINT32 palette_index,
        IDWriteColorGlyphRunEnumerator1 **enumerator) = 0;
};
#ifdef __CRT_UUID_DECL
__CRT_UUID_DECL(IDWriteFactory8, 0xee0a7fb5, 0xdef4, 0x4c23, 0xa4,0x54, 0xc9,0xc7,0xdc,0x87,0x83,0x98)
#endif

#endif

#if defined(__MINGW64_VERSION_MAJOR) && __MINGW64_VERSION_MAJOR < 10
// The DWRITE_COLOR_GLYPH_RUN struct isn't valid.
// <https://sourceforge.net/p/mingw-w64/bugs/913/>
struct DWRITE_COLOR_GLYPH_RUN1_WORKAROUND : DWRITE_COLOR_GLYPH_RUN
{
    DWRITE_GLYPH_IMAGE_FORMATS glyphImageFormat;
    DWRITE_MEASURING_MODE measuringMode;
};
#else
using DWRITE_COLOR_GLYPH_RUN1_WORKAROUND = DWRITE_COLOR_GLYPH_RUN1;
#endif

#if defined(__MINGW64_VERSION_MAJOR) && __MINGW64_VERSION_MAJOR < 11
DEFINE_ENUM_FLAG_OPERATORS(DWRITE_GLYPH_IMAGE_FORMATS);
#endif

#endif /* DWRITE_EXTRA_H */
