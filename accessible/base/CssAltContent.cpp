/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "CssAltContent.h"

#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "nsCoreUtils.h"
#include "nsIContent.h"
#include "nsIFrame.h"

namespace mozilla::a11y {

CssAltContent::CssAltContent(nsIContent* aContent) {
  if (!aContent) {
    return;
  }

  nsIFrame* frame = aContent->GetPrimaryFrame();
  if (!frame) {
    return;
  }
  // Check if this is for a pseudo-element.
  if (nsCoreUtils::IsPseudoElement(aContent)) {
    // If there are children, we want to expose the alt text on those instead,
    // so ignore it for the pseudo-element itself.
    if (aContent->HasChildren()) {
      return;
    }
    // No children only happens when there is alt text with an empty content
    // string; e.g. content: "" / "alt"
    // In this case, we need to expose the alt text on the pseudo-element
    // itself.
    mPseudoElement = aContent->AsElement();
  } else if (aContent->IsInNativeAnonymousSubtree()) {
    if (!frame->IsReplaced()) {
      return;
    }
    dom::Element* parent = aContent->GetParentElement();
    if (parent && nsCoreUtils::IsPseudoElement(parent)) {
      // aContent is a child of a pseudo-element.
      mPseudoElement = parent;
      // We need the frame from the pseudo-element to get the content style.
      frame = parent->GetPrimaryFrame();
      if (!frame) {
        return;
      }
    }
  }
  if (mPseudoElement) {
    mRealElement = mPseudoElement->GetParentElement();
    if (!mRealElement) {
      return;
    }
  }
  if (!mRealElement) {
    // This isn't for a pseudo-element. It might be an element which has its
    // content replaced using CSS content.
    if (aContent->IsElement()) {
      if (!frame->IsReplaced()) {
        return;
      }
      mRealElement = aContent->AsElement();
    } else {
      return;
    }
  }
  mItems = frame->StyleContent()->AltContentItems();
  if (mItems.IsEmpty()) {
    return;
  }

  // There can be multiple alt text items.
  for (const auto& item : mItems) {
    if (item.IsString()) {
      mText.Append(NS_ConvertUTF8toUTF16(item.AsString().AsString()));
    }
  }
}

void CssAltContent::AppendToString(nsAString& aOut) { aOut.Append(mText); }

}  // namespace mozilla::a11y
