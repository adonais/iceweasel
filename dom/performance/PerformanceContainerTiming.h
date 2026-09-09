/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_PerformanceContainerTiming_h_
#define mozilla_dom_PerformanceContainerTiming_h_

#include "mozilla/dom/DOMRect.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/PerformanceContainerTimingBinding.h"
#include "mozilla/dom/PerformanceEntry.h"
#include "nsCycleCollectionParticipant.h"

class nsIFrame;
class nsGenericHTMLElement;

namespace mozilla::dom {

class PerformanceMainThread;

inline constexpr nsLiteralString kContainerTimingName = u"container"_ns;

struct ContainerTimingHelpers final {
  // aPaintedContent is the node that painted (an element, or a text node whose
  // parent element it is attributed to). aPaintRect is relative to
  // aPaintedFrame.
  static void MaybeProcessPaintForContainer(nsIContent* aPaintedContent,
                                            nsIFrame* aPaintedFrame,
                                            const nsRect& aPaintRect);

  // Drops the painted region accumulated for aContainerRoot. Called when the
  // element is disconnected to ensure a reconnection starts with an empty
  // region.
  static void DropRecordForContainerRoot(Element* aContainerRoot);
};

// https://wicg.github.io/container-timing/
class PerformanceContainerTiming final : public PerformanceEntry {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(PerformanceContainerTiming,
                                           PerformanceEntry)

  PerformanceContainerTiming(PerformanceMainThread* aPerformance,
                             Element* aContainerRoot,
                             const nsAString& aIdentifier,
                             const nsRect& aIntersectionRect, uint64_t aSize,
                             const TimeStamp& aFirstRenderTime,
                             const TimeStamp& aPaintTime,
                             Element* aLastPaintedElement);

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  void GetIdentifier(nsAString& aIdentifier) const {
    aIdentifier = mIdentifier;
  }

  already_AddRefed<DOMRectReadOnly> IntersectionRect() const;

  unsigned long long Size() const { return mSize; }

  DOMHighResTimeStamp FirstRenderTime() const;

  DOMHighResTimeStamp StartTime() const override;

  DOMHighResTimeStamp PaintTime() const { return StartTime(); }
  Nullable<DOMHighResTimeStamp> GetPresentationTime() const { return nullptr; }

  Element* GetLastPaintedElement() const;

  nsGenericHTMLElement* GetRootElement() const;

 private:
  ~PerformanceContainerTiming() = default;

  RefPtr<PerformanceMainThread> mPerformance;

  nsWeakPtr mContainerElement;
  nsWeakPtr mLastPaintedElement;

  nsString mIdentifier;

  nsRect mIntersectionRect;
  // Lazily built from mIntersectionRect and cached.
  mutable RefPtr<DOMRectReadOnly> mIntersectionRectObject;
  uint64_t mSize;

  TimeStamp mFirstRenderTime;
  TimeStamp mPaintTime;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_PerformanceContainerTiming_h_
