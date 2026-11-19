/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GFX_FT2FONTS_H
#define GFX_FT2FONTS_H

#include "gfxFT2FontBase.h"
#include "gfxFT2FontList.h"
#include "gfxFont.h"
#include "gfxTypes.h"
#include "mozilla/gfx/2D.h"

class FT2FontEntry;

class gfxFT2Font final : public gfxFT2FontBase {
 public:  // new functions
  gfxFT2Font(const RefPtr<mozilla::gfx::UnscaledFontFreeType>& aUnscaledFont,
             RefPtr<mozilla::gfx::SharedFTFace>&& aFTFace,
             FT2FontEntry* aFontEntry, const gfxFontStyle* aFontStyle,
             int aLoadFlags);

  already_AddRefed<mozilla::gfx::ScaledFont> GetScaledFont(
      const TextRunDrawParams& aRunParams) override;

  bool ShouldHintMetrics() const override;

 protected:
  ~gfxFT2Font() override;
};

#endif /* GFX_FT2FONTS_H */
