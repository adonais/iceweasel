/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Main header first:
#include "SVGImageContext.h"

// Keep others in (case-insensitive) order:
#include "gfxUtils.h"
#include "mozilla/LookAndFeel.h"
#include "mozilla/ServoCSSParser.h"
#include "mozilla/StaticPrefs_svg.h"
#include "mozilla/dom/Document.h"
#include "nsIFrame.h"
#include "nsISVGPaintContext.h"
#include "nsPresContext.h"
#include "nsStyleStruct.h"

namespace mozilla {

/* static */
void SVGImageContext::MaybeStoreContextPaint(SVGImageContext& aContext,
                                             nsIFrame* aFromFrame,
                                             imgIContainer* aImgContainer) {
  return MaybeStoreContextPaint(aContext, *aFromFrame->PresContext(),
                                *aFromFrame->Style(), aImgContainer);
}

/* static */
void SVGImageContext::MaybeStoreContextPaint(SVGImageContext& aContext,
                                             const nsPresContext& aPresContext,
                                             const ComputedStyle& aStyle,
                                             imgIContainer* aImgContainer) {
  if (aImgContainer->GetType() != imgIContainer::TYPE_VECTOR) {
    // Avoid this overhead for raster images.
    return;
  }

  {
    auto scheme = LookAndFeel::ColorSchemeForStyle(
        *aPresContext.Document(), aStyle.StyleUI()->mColorScheme.bits,
        ColorSchemeMode::Preferred);
    aContext.SetColorScheme(Some(scheme));
  }

  {
    const auto& linkParameters = aStyle.StyleUIReset()->mLinkParameters;
    if (!linkParameters._0.IsEmpty()) {
      aContext.SetLinkParameters(linkParameters);
    }
  }

  const nsStyleSVG* style = aStyle.StyleSVG();
  if (!style->ExposesContextProperties()) {
    // Content must have '-moz-context-properties' set to the names of the
    // properties it wants to expose to images it links to.
    return;
  }

  Maybe<nscolor> fill, stroke;
  Maybe<float> fillOpacity, strokeOpacity;

  if ((style->mMozContextProperties.bits & StyleContextPropertyBits::FILL) &&
      style->mFill.kind.IsColor()) {
    fill = Some(style->mFill.kind.AsColor().CalcColor(aStyle));
  }
  if ((style->mMozContextProperties.bits & StyleContextPropertyBits::STROKE) &&
      style->mStroke.kind.IsColor()) {
    stroke = Some(style->mStroke.kind.AsColor().CalcColor(aStyle));
  }
  if ((style->mMozContextProperties.bits &
       StyleContextPropertyBits::FILL_OPACITY) &&
      style->mFillOpacity.IsOpacity()) {
    fillOpacity = Some(style->mFillOpacity.AsOpacity());
  }
  if ((style->mMozContextProperties.bits &
       StyleContextPropertyBits::STROKE_OPACITY) &&
      style->mStrokeOpacity.IsOpacity()) {
    strokeOpacity = Some(style->mStrokeOpacity.AsOpacity());
  }
  if (fill || stroke || fillOpacity || strokeOpacity) {
    aContext.mContextPaint =
        MakeRefPtr<SVGContextPaint>(fill, fillOpacity, stroke, strokeOpacity);
  }
}

/* static */
void SVGImageContext::MaybeStoreContextPaint(SVGImageContext& aContext,
                                             nsISVGPaintContext* aPaintContext,
                                             imgIContainer* aImgContainer) {
  if (aImgContainer->GetType() != imgIContainer::TYPE_VECTOR ||
      !aPaintContext) {
    // Avoid this overhead for raster images.
    return;
  }

  nsCString value;
  float opacity;
  Maybe<nscolor> fill, stroke;
  Maybe<float> fillOpacity, strokeOpacity;

  if (NS_SUCCEEDED(aPaintContext->GetStrokeColor(value)) && !value.IsEmpty()) {
    nscolor color;
    if (ServoCSSParser::ComputeColor(nullptr, value, &color)) {
      stroke = Some(color);
    }
  }
  if (NS_SUCCEEDED(aPaintContext->GetFillColor(value)) && !value.IsEmpty()) {
    nscolor color;
    if (ServoCSSParser::ComputeColor(nullptr, value, &color)) {
      fill = Some(color);
    }
  }
  if (NS_SUCCEEDED(aPaintContext->GetStrokeOpacity(&opacity))) {
    strokeOpacity = Some(opacity);
  }
  if (NS_SUCCEEDED(aPaintContext->GetFillOpacity(&opacity))) {
    fillOpacity = Some(opacity);
  }
  if (stroke || fill || strokeOpacity || fillOpacity) {
    aContext.mContextPaint =
        MakeRefPtr<SVGContextPaint>(fill, fillOpacity, stroke, strokeOpacity);
  }
}

}  // namespace mozilla
