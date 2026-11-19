/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gfxFT2Fonts.h"

#include "gfxTypes.h"

using namespace mozilla;
using namespace mozilla::gfx;

/**
 * gfxFT2Font
 */

gfxFT2Font::gfxFT2Font(const RefPtr<UnscaledFontFreeType>& aUnscaledFont,
                       RefPtr<mozilla::gfx::SharedFTFace>&& aFTFace,
                       FT2FontEntry* aFontEntry, const gfxFontStyle* aFontStyle,
                       int aLoadFlags)
    : gfxFT2FontBase(aUnscaledFont, std::move(aFTFace), aFontEntry, aFontStyle,
                     aLoadFlags, aFontStyle->NeedsSyntheticBold(aFontEntry)) {
  NS_ASSERTION(mFontEntry,
               "Unable to find font entry for font.  Something is whack.");
  InitMetrics();
}

gfxFT2Font::~gfxFT2Font() {}

already_AddRefed<ScaledFont> gfxFT2Font::GetScaledFont(
    const TextRunDrawParams& aRunParams) {
  if (ScaledFont* scaledFont = mAzureScaledFont) {
    return do_AddRef(scaledFont);
  }

  RefPtr<ScaledFont> newScaledFont = Factory::CreateScaledFontForFreeTypeFont(
      GetUnscaledFont(), GetAdjustedSize(), mFTFace,
      GetStyle()->NeedsSyntheticBold(mFontEntry));
  if (!newScaledFont) {
    return nullptr;
  }

  InitializeScaledFont(newScaledFont);

  if (mAzureScaledFont.compareExchange(nullptr, newScaledFont.get())) {
    newScaledFont.forget().leak();
  }
  ScaledFont* scaledFont = mAzureScaledFont;
  return do_AddRef(scaledFont);
}

bool gfxFT2Font::ShouldHintMetrics() const {
  return !gfxPlatform::GetPlatform()->RequiresLinearZoom();
}
