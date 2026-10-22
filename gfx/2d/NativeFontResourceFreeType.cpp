/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "NativeFontResourceFreeType.h"

#include "UnscaledFontFreeType.h"

namespace mozilla::gfx {

NativeFontResourceFreeType::NativeFontResourceFreeType(
    const uint8_t*&& aFontData, uint32_t aDataLength)
    : NativeFontResource(aDataLength),
      mFontData(MakeRefPtr<FontData>(std::move(aFontData), aDataLength)) {}

NativeFontResourceFreeType::~NativeFontResourceFreeType() = default;

template <class T>
already_AddRefed<T> NativeFontResourceFreeType::CreateInternal(
    const uint8_t* aFontData, uint32_t aDataLength) {
  if (!aFontData || !aDataLength) {
    return nullptr;
  }
  auto* fontData = static_cast<uint8_t*>(malloc(aDataLength));
  if (!fontData) {
    return nullptr;
  }
  memcpy(fontData, aFontData, aDataLength);

  RefPtr<T> resource =
      new T(std::move(static_cast<const uint8_t*>(fontData)), aDataLength);
  return resource.forget();
}

#ifdef MOZ_WIDGET_ANDROID
already_AddRefed<NativeFontResourceFreeType> NativeFontResourceFreeType::Create(
    const uint8_t* aFontData, uint32_t aDataLength) {
  return CreateInternal<NativeFontResourceFreeType>(aFontData, aDataLength);
}

already_AddRefed<UnscaledFont> NativeFontResourceFreeType::CreateUnscaledFont(
    uint32_t aIndex, const uint8_t* aInstanceData,
    uint32_t aInstanceDataLength) {
  if (RefPtr<SharedFTFace> face = CloneFace()) {
    return MakeAndAddRef<UnscaledFontFreeType>(std::move(face));
  }
  return nullptr;
}
#endif

already_AddRefed<SharedFTFace> NativeFontResourceFreeType::CloneFace(
    int aFaceIndex) {
  return Factory::NewSharedFTFaceFromData(mFontData, aFaceIndex);
}

#ifdef MOZ_WIDGET_GTK
NativeFontResourceFontconfig::NativeFontResourceFontconfig(
    const uint8_t*&& aFontData, uint32_t aDataLength)
    : NativeFontResourceFreeType(std::move(aFontData), aDataLength) {}

already_AddRefed<UnscaledFont> NativeFontResourceFontconfig::CreateUnscaledFont(
    uint32_t aIndex, const uint8_t* aInstanceData,
    uint32_t aInstanceDataLength) {
  if (RefPtr<SharedFTFace> face = CloneFace()) {
    return MakeAndAddRef<UnscaledFontFontconfig>(std::move(face));
  }
  return nullptr;
}

already_AddRefed<NativeFontResourceFontconfig>
NativeFontResourceFontconfig::Create(const uint8_t* aFontData,
                                     uint32_t aDataLength) {
  return CreateInternal<NativeFontResourceFontconfig>(aFontData, aDataLength);
}
#endif

}  // namespace mozilla::gfx
