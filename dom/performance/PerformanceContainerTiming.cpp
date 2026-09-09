/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PerformanceContainerTiming.h"

#include "PerformanceMainThread.h"
#include "mozilla/PresShell.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/DocumentInlines.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/PerformanceContainerTimingBinding.h"
#include "nsContentUtils.h"
#include "nsGenericHTMLElement.h"
#include "nsGkAtoms.h"
#include "nsGlobalWindowInner.h"
#include "nsIFrame.h"
#include "nsLayoutUtils.h"
#include "nsRFPService.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_INHERITED(PerformanceContainerTiming, PerformanceEntry,
                                   mPerformance, mIntersectionRectObject)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(PerformanceContainerTiming)
NS_INTERFACE_MAP_END_INHERITING(PerformanceEntry)

NS_IMPL_ADDREF_INHERITED(PerformanceContainerTiming, PerformanceEntry)
NS_IMPL_RELEASE_INHERITED(PerformanceContainerTiming, PerformanceEntry)

PerformanceContainerTiming::PerformanceContainerTiming(
    PerformanceMainThread* aPerformance, Element* aContainerRoot,
    const nsAString& aIdentifier, const nsRect& aIntersectionRect,
    uint64_t aSize, const TimeStamp& aFirstRenderTime,
    const TimeStamp& aPaintTime, Element* aLastPaintedElement)
    : PerformanceEntry(aPerformance->GetParentObject(), u""_ns,
                       nsGkAtoms::container),
      mPerformance(aPerformance),
      mIdentifier(aIdentifier),
      mIntersectionRect(aIntersectionRect),
      mSize(aSize),
      mFirstRenderTime(aFirstRenderTime),
      mPaintTime(aPaintTime) {
  MOZ_ASSERT(mPerformance);
  MOZ_ASSERT(aContainerRoot);
  MOZ_ASSERT(!aContainerRoot->ChromeOnlyAccess());
  mContainerElement = do_GetWeakReference(aContainerRoot);

  if (aLastPaintedElement) {
    if (aLastPaintedElement->ChromeOnlyAccess()) {
      mLastPaintedElement = do_GetWeakReference(Element::FromNodeOrNull(
          aLastPaintedElement->FindFirstNonChromeOnlyAccessContent()));
    } else {
      mLastPaintedElement = do_GetWeakReference(aLastPaintedElement);
    }
  }
}

JSObject* PerformanceContainerTiming::WrapObject(
    JSContext* aCx, JS::Handle<JSObject*> aGivenProto) {
  return PerformanceContainerTiming_Binding::Wrap(aCx, this, aGivenProto);
}

nsGenericHTMLElement* PerformanceContainerTiming::GetRootElement() const {
  nsCOMPtr<Element> element = do_QueryReferent(mContainerElement);
  return element ? nsGenericHTMLElement::FromNodeOrNull(
                       nsContentUtils::GetAnElementForTiming(
                           element, element->GetComposedDoc(), nullptr))
                 : nullptr;
}

Element* PerformanceContainerTiming::GetLastPaintedElement() const {
  nsCOMPtr<Element> element = do_QueryReferent(mLastPaintedElement);
  return element ? nsContentUtils::GetAnElementForTiming(
                       element, element->GetComposedDoc(), nullptr)
                 : nullptr;
}

already_AddRefed<DOMRectReadOnly> PerformanceContainerTiming::IntersectionRect()
    const {
  if (!mIntersectionRectObject) {
    double x =
        NSAppUnitsToDoublePixels(mIntersectionRect.x, AppUnitsPerCSSPixel());
    double y =
        NSAppUnitsToDoublePixels(mIntersectionRect.y, AppUnitsPerCSSPixel());
    double width = NSAppUnitsToDoublePixels(mIntersectionRect.width,
                                            AppUnitsPerCSSPixel());
    double height = NSAppUnitsToDoublePixels(mIntersectionRect.height,
                                             AppUnitsPerCSSPixel());
    mIntersectionRectObject = new DOMRectReadOnly(
        mPerformance->GetParentObject(), x, y, width, height);
  }
  return do_AddRef(mIntersectionRectObject);
}

DOMHighResTimeStamp PerformanceContainerTiming::FirstRenderTime() const {
  return mPerformance->GetReducedTimePrecisionDOMHighRes(mFirstRenderTime);
}

DOMHighResTimeStamp PerformanceContainerTiming::StartTime() const {
  return mPerformance->GetReducedTimePrecisionDOMHighRes(mPaintTime);
}

// ContainerTimingHelpers implementation

/* static */
void ContainerTimingHelpers::DropRecordForContainerRoot(
    Element* aContainerRoot) {
  nsGlobalWindowInner* window =
      nsGlobalWindowInner::Cast(aContainerRoot->OwnerDoc()->GetInnerWindow());
  if (!window) {
    return;
  }
  if (auto* perf = static_cast<PerformanceMainThread*>(
          window->GetPerformanceIfExists())) {
    perf->GetContainerTimingRecords().Remove(aContainerRoot);
  }
}

/* static */
void ContainerTimingHelpers::MaybeProcessPaintForContainer(
    nsIContent* aPaintedContent, nsIFrame* aPaintedFrame,
    const nsRect& aPaintRect) {
  if (!StaticPrefs::dom_enable_container_timing()) {
    return;
  }

  if (!aPaintedContent || !aPaintedFrame) {
    return;
  }

  if (!aPaintedFrame->PresContext()
           ->Document()
           ->MayHaveContainerTimingAttributes()) {
    return;
  }

  // An element paints as itself; a text node is attributed to its parent
  // element. Text directly inside a shadow root has no parent element, and text
  // inside a shadow-tree element resolves to that element, which the
  // uncomposed-document check below excludes.
  Element* paintedElement = Element::FromNode(aPaintedContent);
  if (!paintedElement) {
    paintedElement = aPaintedContent->GetParentElement();
  }
  if (!paintedElement) {
    return;
  }

  Element* nearestRoot = paintedElement->GetContainerTimingRoot();
  // Only an HTMLElement can be a container root.
  bool selfIsRoot = paintedElement->IsHTMLElement() &&
                    paintedElement->HasAttr(nsGkAtoms::containertiming);
  if (!nearestRoot && !selfIsRoot) {
    return;
  }

  Document* document = paintedElement->GetUncomposedDoc();
  if (!document) {
    return;
  }

  nsPresContext* pc = document->GetPresContext();
  if (!pc) {
    return;
  }

  PerformanceMainThread* perf = pc->GetPerformanceMainThread();
  if (!perf) {
    return;
  }

  // Stop collecting container timing once a scroll has happened, as the
  // accumulated document-relative geometry becomes inconsistent. Temporary
  // while the coordinate-system and interaction questions are resolved
  // upstream; see https://github.com/WICG/container-timing/issues/13.
  if (perf->HasDispatchedScrollEvent()) {
    return;
  }

  nsIFrame* rootFrame = aPaintedFrame->PresShell()->GetRootFrame();
  if (!rootFrame) {
    return;
  }

  // Transform the paint rect from the painted frame's coordinate space
  // to the root frame's coordinate space for consistent measurements.
  nsRect transformedRect = nsLayoutUtils::TransformFrameRectToAncestor(
      aPaintedFrame, aPaintRect, rootFrame);

  // Clip to the viewport so content painting outside it does not inflate the
  // reported size/intersectionRect. transformedRect is in rootFrame's
  // coordinate space, and rootFrame (the viewport frame) is sized to the
  // viewport, so its rect is the viewport rectangle. This is a cheap
  // approximation of the spec's intersection-rect algorithm: it clips to the
  // viewport but does not account for clipping by overflow/scroll-container
  // ancestors.
  transformedRect =
      transformedRect.Intersect(nsRect(nsPoint(), rootFrame->GetSize()));
  if (transformedRect.IsEmpty()) {
    return;
  }

  ContainerTimingRecordMap& records = perf->GetContainerTimingRecords();

  // Update every container root tracking the element: the element itself if it
  // is a container root, then the cached chain of ancestor roots (each root
  // caches its own next root up), which already accounts for
  // containertimingignore boundaries.
  AutoTArray<Element*, 4> roots;
  if (selfIsRoot) {
    roots.AppendElement(paintedElement);
  }
  for (Element* root = nearestRoot; root;
       root = root->GetContainerTimingRoot()) {
    roots.AppendElement(root);
  }

  // https://wicg.github.io/container-timing/#maybe-update-the-last-new-painted-area
  for (Element* root : roots) {
    ContainerTimingRecord& record = records.LookupOrInsertWith(root, [&root] {
      ContainerTimingRecord newRecord;
      root->GetAttr(nsGkAtoms::containertiming, newRecord.mIdentifier);
      return newRecord;
    });
    if (record.mPaintedRegion.Contains(transformedRect)) {
      continue;
    }
    const uint64_t areaBefore = record.mPaintedRegionArea;
    record.mPaintedRegion.OrWith(transformedRect);
    // This area calculation could be avoided by adding a variant of OrWith
    // that reports the change in region area.
    record.mPaintedRegionArea = record.mPaintedRegion.Area();
    uint64_t newPaintedArea = record.mPaintedRegionArea - areaBefore;
    if (newPaintedArea > record.mLastNewPaintedAreaSize) {
      record.mLastNewPaintedAreaElement = paintedElement;
      record.mLastNewPaintedAreaSize = newPaintedArea;
    }
    record.mHasPendingChanges = true;
  }
}

}  // namespace mozilla::dom
