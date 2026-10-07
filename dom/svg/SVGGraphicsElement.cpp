/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SVGGraphicsElement.h"

#include "mozilla/ISVGDisplayableFrame.h"
#include "mozilla/SVGContentUtils.h"
#include "mozilla/SVGUtils.h"
#include "mozilla/dom/BindContext.h"
#include "mozilla/dom/SVGAnimatedLength.h"
#include "mozilla/dom/SVGGraphicsElementBinding.h"
#include "mozilla/dom/SVGMatrix.h"
#include "mozilla/dom/SVGRect.h"
#include "nsIContentInlines.h"

namespace mozilla::dom {

//----------------------------------------------------------------------
// nsISupports methods

NS_IMPL_ADDREF_INHERITED(SVGGraphicsElement, SVGGraphicsElementBase)
NS_IMPL_RELEASE_INHERITED(SVGGraphicsElement, SVGGraphicsElementBase)

NS_INTERFACE_MAP_BEGIN(SVGGraphicsElement)
  NS_INTERFACE_MAP_ENTRY(mozilla::dom::SVGTests)
NS_INTERFACE_MAP_END_INHERITING(SVGGraphicsElementBase)

//----------------------------------------------------------------------
// Implementation

SVGGraphicsElement::SVGGraphicsElement(
    already_AddRefed<mozilla::dom::NodeInfo> aNodeInfo)
    : SVGGraphicsElementBase(std::move(aNodeInfo)) {}

already_AddRefed<SVGRect> SVGGraphicsElement::GetBBox(
    const SVGBoundingBoxOptions& aOptions) {
  nsIFrame* frame = GetPrimaryFrame(FlushType::Layout);

  auto ZeroBBox = [this]() {
    return MakeAndAddRef<SVGRect>(this, gfx::Rect{0, 0, 0, 0});
  };

  if (!frame || frame->HasAnyStateBits(NS_FRAME_IS_NONDISPLAY)) {
    return ZeroBBox();
  }
  ISVGDisplayableFrame* svgframe = do_QueryFrame(frame);

  if (!svgframe && !frame->IsInSVGTextSubtree()) {
    return ZeroBBox();
  }

  if (!NS_SVGNewGetBBoxEnabled()) {
    return MakeAndAddRef<SVGRect>(
        this,
        ToRect(SVGUtils::GetBBox(frame, {SVGBBoxFlag::IncludeFillGeometry,
                                         SVGBBoxFlag::TextContentBounds,
                                         SVGBBoxFlag::UseUserSpaceOfUseElement,
                                         SVGBBoxFlag::DisregardCSSZoom})));
  }
  SVGBBoxFlags flags;
  if (aOptions.mFill) {
    flags += SVGBBoxFlag::IncludeFillGeometry;
  }
  if (aOptions.mStroke) {
    flags += SVGBBoxFlag::IncludeStroke;
  }
  if (aOptions.mMarkers) {
    flags += {SVGBBoxFlag::IncludeFillGeometry, SVGBBoxFlag::IncludeMarkers};
  }
  if (aOptions.mClipped) {
    flags += {SVGBBoxFlag::IncludeFillGeometry, SVGBBoxFlag::IncludeClipped};
  }
  if (flags.isEmpty()) {
    return ZeroBBox();
  }
  flags += {SVGBBoxFlag::UseUserSpaceOfUseElement,
            SVGBBoxFlag::TextContentBounds, SVGBBoxFlag::DisregardCSSZoom};
  return MakeAndAddRef<SVGRect>(this, ToRect(SVGUtils::GetBBox(frame, flags)));
}

already_AddRefed<SVGMatrix> SVGGraphicsElement::GetCTM() {
  if (auto* currentDoc = GetComposedDoc()) {
    // Flush all pending notifications so that our frames are up to date
    currentDoc->FlushPendingNotifications(FlushType::Layout);
  }
  gfx::Matrix m = SVGContentUtils::GetCTM(this);
  if (m.IsSingular()) {
    m = {};
  }
  return MakeAndAddRef<SVGMatrix>(ThebesMatrix(m));
}

already_AddRefed<SVGMatrix> SVGGraphicsElement::GetScreenCTM() {
  if (auto* currentDoc = GetComposedDoc()) {
    // Flush all pending notifications so that our frames are up to date
    currentDoc->FlushPendingNotifications(FlushType::Layout);
  }
  gfx::Matrix m = SVGContentUtils::GetScreenCTM(this);
  if (m.IsSingular()) {
    m = {};
  }
  return MakeAndAddRef<SVGMatrix>(ThebesMatrix(m));
}

bool SVGGraphicsElement::IsSVGFocusable(bool* aIsFocusable,
                                        int32_t* aTabIndex) {
  // XXXedgar, maybe we could factor out the common code for SVG, HTML and
  // MathML elements, see bug 1586011.
  if (!IsInComposedDoc() || IsInDesignMode()) {
    // In designMode documents we only allow focusing the document.
    *aTabIndex = -1;
    *aIsFocusable = false;
    return true;
  }

  *aTabIndex = TabIndex();
  // If a tabindex is specified at all, or the default tabindex is 0, we're
  // focusable
  *aIsFocusable = *aTabIndex >= 0 || GetTabIndexAttrValue().isSome();
  return false;
}

Focusable SVGGraphicsElement::IsFocusableWithoutStyle(IsFocusableFlags) {
  Focusable result;
  IsSVGFocusable(&result.mFocusable, &result.mTabIndex);
  return result;
}

}  // namespace mozilla::dom
