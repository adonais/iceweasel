/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SVGContextPaint.h"

#include "SVGPaintServerFrame.h"
#include "gfxContext.h"
#include "gfxUtils.h"
#include "mozilla/BasePrincipal.h"
#include "mozilla/SVGObserverUtils.h"
#include "mozilla/SVGUtils.h"
#include "mozilla/StaticPrefs_svg.h"
#include "mozilla/dom/Document.h"
#include "mozilla/extensions/WebExtensionPolicy.h"
#include "mozilla/gfx/2D.h"

using namespace mozilla::gfx;
using namespace mozilla::image;

namespace mozilla {

using image::imgDrawingParams;

/* static */
bool SVGContextPaint::IsAllowedForImageFromURI(nsIURI* aURI) {
  if (StaticPrefs::svg_context_properties_content_enabled()) {
    return true;
  }

  // Context paint is pref'ed off for Web content.  Ideally we'd have some
  // easy means to determine whether the frame that has linked to the image
  // is a frame for a content node that originated from Web content.
  // Unfortunately different types of anonymous content, about: documents
  // such as about:reader, etc. that are "our" code that we ship are
  // sometimes hard to distinguish from real Web content.  As a result,
  // instead of trying to figure out what content is "ours" we instead let
  // any content provide image context paint, but only if the image is
  // chrome:// or resource:// do we return true.  This should be sufficient
  // to stop the image context paint feature being useful to (and therefore
  // used by and relied upon by) Web content.  (We don't want Web content to
  // use this feature because we're not sure that image context paint is a
  // good mechanism for wider use, or suitable for specification.)
  //
  // Because the default favicon used in the browser UI needs context paint, we
  // also allow it for:
  // - page-icon:<page-url> (used in history and bookmark items)
  // - cached-favicon:<page-url> (used in the awesomebar)
  // This allowance does also inadvertently expose context-paint to 3rd-party
  // favicons, which is not great, but that hasn't caused trouble as far as we
  // know. Also: other places such as the tab bar don't use these protocols to
  // load favicons, so they help to ensure that 3rd-party favicons don't grow
  // to depend on this feature.
  //
  // One case that is not covered by chrome:// or resource:// are WebExtensions,
  // specifically ones that are "ours". WebExtensions are moz-extension://
  // regardless if the extension is in-tree or not. Since we don't want
  // extension developers coming to rely on image context paint either, we only
  // enable context-paint for extensions that are owned by Mozilla
  // (based on the extension permission "internal:svgContextPropertiesAllowed").
  //
  // We also allow this for browser UI icons that are served up from
  // Mozilla-controlled domains listed in the
  // svg.context-properties.content.allowed-domains pref.
  //
  nsAutoCString scheme;
  if (NS_SUCCEEDED(aURI->GetScheme(scheme)) &&
      (scheme.EqualsLiteral("chrome") || scheme.EqualsLiteral("resource") ||
       scheme.EqualsLiteral("page-icon") ||
       scheme.EqualsLiteral("cached-favicon"))) {
    return true;
  }
  RefPtr<BasePrincipal> principal =
      BasePrincipal::CreateContentPrincipal(aURI, OriginAttributes());

  RefPtr<extensions::WebExtensionPolicy> addonPolicy = principal->AddonPolicy();
  if (addonPolicy) {
    // Only allowed for extensions that have the
    // internal:svgContextPropertiesAllowed permission (added internally from
    // to Mozilla-owned extensions, see `isMozillaExtension` function
    // defined in Extension.sys.mjs for the exact criteria).
    return addonPolicy->HasPermission(
        nsGkAtoms::svgContextPropertiesAllowedPermission);
  }

  bool isInAllowList = false;
  principal->IsURIInPrefList("svg.context-properties.content.allowed-domains",
                             &isInAllowList);
  return isInAllowList;
}

/**
 * Stores in |aTargetPaint| information on how to reconstruct the current
 * fill or stroke pattern. Will also set the paint opacity to transparent if
 * the paint is set to "none".
 * @param aOuterContextPaint pattern information from the outer text context
 * @param aTargetPaint where to store the current pattern information
 * @param aFillOrStroke member pointer to the paint we are setting up
 */
static void SetupInheritablePaint(const DrawTarget* aDrawTarget,
                                  const gfxMatrix& aContextMatrix,
                                  nsIFrame* aFrame, float& aOpacity,
                                  SVGContextPaint* aOuterContextPaint,
                                  SVGContextPaint::Paint& aTargetPaint,
                                  StyleSVGPaint nsStyleSVG::* aFillOrStroke,
                                  nscolor aDefaultFallbackColor,
                                  imgDrawingParams& aImgParams) {
  using Tag = SVGContextPaint::Tag;

  const nsStyleSVG* style = aFrame->StyleSVG();
  SVGPaintServerFrame* ps =
      SVGObserverUtils::GetAndObservePaintServer(aFrame, aFillOrStroke);

  if (ps) {
    RefPtr<gfxPattern> pattern =
        ps->GetPaintServerPattern(aFrame, aDrawTarget, aContextMatrix,
                                  aFillOrStroke, aOpacity, aImgParams);

    if (pattern) {
      aTargetPaint.SetPaintServer(aFrame, aContextMatrix, ps);
      return;
    }
  }

  if (aOuterContextPaint) {
    RefPtr<gfxPattern> pattern;
    auto tag = SVGContextPaint::Paint::Tag::None;
    switch ((style->*aFillOrStroke).kind.tag) {
      case StyleSVGPaintKind::Tag::ContextFill:
        tag = SVGContextPaint::Paint::Tag::ContextFill;
        pattern = aOuterContextPaint->GetPattern(
            Tag::Fill, aDrawTarget, aOpacity, aContextMatrix, aImgParams);
        break;
      case StyleSVGPaintKind::Tag::ContextStroke:
        tag = SVGContextPaint::Paint::Tag::ContextStroke;
        pattern = aOuterContextPaint->GetPattern(
            Tag::Stroke, aDrawTarget, aOpacity, aContextMatrix, aImgParams);
        break;
      default:;
    }
    if (pattern) {
      aTargetPaint.SetContextPaint(aOuterContextPaint, tag);
      return;
    }
  }

  nscolor color = SVGUtils::GetFallbackOrPaintColor(
      *aFrame->Style(), aFillOrStroke, aDefaultFallbackColor);
  aTargetPaint.SetColor(color);
}

SVGContextPaint::SVGContextPaint(const DrawTarget* aDrawTarget,
                                 const gfxMatrix& aContextMatrix,
                                 nsIFrame* aFrame,
                                 SVGContextPaint* aOuterContextPaint,
                                 imgDrawingParams& aImgParams) {
  const nsStyleSVG* style = aFrame->StyleSVG();

  // fill:
  if (style->mFill.kind.IsNone()) {
    mOpacity[Tag::Fill] = 0.0f;
  } else {
    float opacity =
        SVGUtils::GetOpacity(style->mFillOpacity, aOuterContextPaint);

    SetupInheritablePaint(aDrawTarget, aContextMatrix, aFrame, opacity,
                          aOuterContextPaint, mPaint[Tag::Fill],
                          &nsStyleSVG::mFill, NS_RGB(0, 0, 0), aImgParams);

    mOpacity[Tag::Fill] = opacity;

    mDrawMode |= DrawMode::GLYPH_FILL;
  }

  // stroke:
  if (style->mStroke.kind.IsNone()) {
    mOpacity[Tag::Stroke] = 0.0f;
  } else {
    float opacity =
        SVGUtils::GetOpacity(style->mStrokeOpacity, aOuterContextPaint);

    SetupInheritablePaint(aDrawTarget, aContextMatrix, aFrame, opacity,
                          aOuterContextPaint, mPaint[Tag::Stroke],
                          &nsStyleSVG::mStroke, NS_RGBA(0, 0, 0, 0),
                          aImgParams);

    mOpacity[Tag::Stroke] = opacity;

    mDrawMode |= DrawMode::GLYPH_STROKE;
  }
}

SVGContextPaint::SVGContextPaint(gfxContext* aContext) {
  std::fill(mOpacity.begin(), mOpacity.end(), 1.0f);
  if (RefPtr<gfxPattern> fillPattern = aContext->GetPattern()) {
    mPaint[Tag::Fill].SetPattern(fillPattern, aContext->CurrentMatrixDouble());
    mDrawMode |= DrawMode::GLYPH_FILL;
  }
}

void SVGContextPaint::InitStrokeGeometry(gfxContext* aContext,
                                         float devUnitsPerSVGUnit) {
  mStrokeWidth = aContext->CurrentLineWidth() / devUnitsPerSVGUnit;
  aContext->CurrentDash(mDashes, &mDashOffset);
  std::transform(mDashes.begin(), mDashes.end(), mDashes.begin(),
                 [&devUnitsPerSVGUnit](Float aDash) -> Float {
                   return aDash / devUnitsPerSVGUnit;
                 });
  mDashOffset /= devUnitsPerSVGUnit;
}

SVGContextPaint* SVGContextPaint::GetContextPaint(nsIContent* aContent) {
  dom::Document* ownerDoc = aContent->OwnerDoc();

  const auto* contextPaint = ownerDoc->GetCurrentContextPaint();

  // XXX The SVGContextPaint that Document keeps around is const. We could
  // and should keep that constness to the SVGContextPaint that we get here
  // (SVGImageContext is never changed after it is initialized).
  //
  // Unfortunately lazy initialization of SVGContextPaint (which is a member of
  // SVGImageContext, and also conceptually never changes after construction)
  // prevents some of SVGContextPaint's conceptually const methods from being
  // const.  Trying to fix SVGContextPaint (perhaps by using |mutable|) is a
  // bit of a headache so for now we punt on that, don't reapply the constness
  // to the SVGContextPaint here, and trust that no one will add code that
  // actually modifies the object.
  return const_cast<SVGContextPaint*>(contextPaint);
}

bool SVGContextPaint::IsSolidColor(Tag aTag) const {
  return mPaint[aTag].IsSolidColor();
}

DeviceColor SVGContextPaint::AsSolidColor(Tag aTag) const {
  MOZ_ASSERT(IsSolidColor(aTag), "Must be solid color");

  imgDrawingParams dummy;
  RefPtr<gfxPattern> pattern =
      mPaint[aTag].GetPattern(nullptr, 1.0f, nullptr, gfxMatrix(), dummy);

  DeviceColor color;
  MOZ_ASSERT(pattern->GetSolidColor(color));
  return color;
}

already_AddRefed<gfxPattern> SVGContextPaint::GetPattern(
    Tag aTag, const DrawTarget* aDrawTarget, float aOpacity,
    const gfxMatrix& aCTM, imgDrawingParams& aImgParams) const {
  return mPaint[aTag].GetPattern(
      aDrawTarget, aOpacity,
      aTag == Tag::Fill ? &nsStyleSVG::mFill : &nsStyleSVG::mStroke, aCTM,
      aImgParams);
}

already_AddRefed<gfxPattern> SVGContextPaint::Paint::GetPattern(
    const DrawTarget* aDrawTarget, float aOpacity,
    StyleSVGPaint nsStyleSVG::* aFillOrStroke, const gfxMatrix& aCTM,
    imgDrawingParams& aImgParams) const {
  RefPtr<gfxPattern> pattern;
  if (mPatternCache.Get(aOpacity, getter_AddRefs(pattern))) {
    // Set the pattern matrix just in case it was messed with by a previous
    // caller. We should get the same matrix each time a pattern is constructed
    // so this should be fine.
    pattern->SetMatrix(aCTM * mPatternMatrix);
    return pattern.forget();
  }

  switch (mPaintType) {
    case Tag::None:
      return nullptr;
    case Tag::Color: {
      DeviceColor color = ToDeviceColor(mPaintDefinition.mColor);
      color.a *= aOpacity;
      pattern = new gfxPattern(color);
      mPatternMatrix = gfxMatrix();
      break;
    }
    case Tag::Pattern:
      pattern = mPaintDefinition.mPattern;
      pattern->SetMatrix(aCTM * mPatternMatrix);
      break;
    case Tag::PaintServer:
      pattern = mPaintDefinition.mPaintServerFrame->GetPaintServerPattern(
          mFrame, aDrawTarget, mContextMatrix, aFillOrStroke, aOpacity,
          aImgParams);
      if (!pattern) {
        return nullptr;
      }
      {
        // m maps original-user-space to pattern space
        gfxMatrix m = pattern->GetMatrix();
        gfxMatrix deviceToOriginalUserSpace = mContextMatrix;
        if (!deviceToOriginalUserSpace.Invert()) {
          return nullptr;
        }
        // mPatternMatrix maps device space to pattern space via original user
        // space
        mPatternMatrix = deviceToOriginalUserSpace * m;
      }
      pattern->SetMatrix(aCTM * mPatternMatrix);
      break;
    case Tag::ContextFill:
      pattern = mPaintDefinition.mContextPaint->GetPattern(
          SVGContextPaint::Tag::Fill, aDrawTarget, aOpacity, aCTM, aImgParams);
      // Don't cache this. mContextPaint will have cached it anyway. If we
      // cache it, we'll have to compute mPatternMatrix, which is annoying.
      return pattern.forget();
    case Tag::ContextStroke:
      pattern = mPaintDefinition.mContextPaint->GetPattern(
          SVGContextPaint::Tag::Stroke, aDrawTarget, aOpacity, aCTM,
          aImgParams);
      // Don't cache this. mContextPaint will have cached it anyway. If we
      // cache it, we'll have to compute mPatternMatrix, which is annoying.
      return pattern.forget();
    default:
      MOZ_ASSERT(false, "invalid paint type");
      return nullptr;
  }

  mPatternCache.InsertOrUpdate(aOpacity, RefPtr{pattern});
  return pattern.forget();
}

uint32_t SVGContextPaint::Hash() const {
  uint32_t hash = 0;

  if (IsSolidColor(Tag::Fill)) {
    hash = HashGeneric(hash, AsSolidColor(Tag::Fill).ToABGR());
  } else {
    // Arbitrary number, just to avoid trivial hash collisions between pairs of
    // instances where one embedding context has fill set to the same value as
    // another context has stroke set to.
    hash = 1;
  }

  if (IsSolidColor(Tag::Stroke)) {
    hash = HashGeneric(hash, AsSolidColor(Tag::Stroke).ToABGR());
  }

  if (mOpacity[Tag::Fill] != 1.0f) {
    hash = HashGeneric(hash, mOpacity[Tag::Fill]);
  }

  if (mOpacity[Tag::Stroke] != 1.0f) {
    hash = HashGeneric(hash, mOpacity[Tag::Stroke]);
  }

  return hash;
}

AutoSetRestoreSVGContextPaint::AutoSetRestoreSVGContextPaint(
    const SVGContextPaint* aContextPaint, dom::Document* aDocument)
    : mDocument(aDocument),
      mOuterContextPaint(aDocument->GetCurrentContextPaint()) {
  mDocument->SetCurrentContextPaint(aContextPaint);
}

AutoSetRestoreSVGContextPaint::~AutoSetRestoreSVGContextPaint() {
  mDocument->SetCurrentContextPaint(mOuterContextPaint);
}

}  // namespace mozilla
