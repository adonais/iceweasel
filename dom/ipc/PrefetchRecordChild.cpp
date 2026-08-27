/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/PrefetchRecordChild.h"

#include "mozilla/dom/Document.h"
#include "mozilla/dom/PrefetchLog.h"
#include "mozilla/dom/SpeculationRulesManager.h"
#include "mozilla/dom/WindowGlobalChild.h"
#include "nsGlobalWindowInner.h"

namespace mozilla::dom {

PrefetchRecordChild::PrefetchRecordChild(nsIURI* aURL,
                                         PrefetchAnonymizationPolicy aPolicy)
    : mURL(aURL), mAnonPolicy(aPolicy) {
  if (LOG_SPECRULES_ENABLED()) {
    nsAutoCString spec;
    if (mURL) {
      mURL->GetSpec(spec);
    }
    LOG_SPECRULES(("PrefetchRecordChild ctor: this=%p, url=%s, anon=%d", this,
                   spec.get(), static_cast<int>(mAnonPolicy)));
  }
}

void PrefetchRecordChild::ActorDestroy(ActorDestroyReason aReason) {
  // Remove this handle from SpeculationRulesManager::mPrefetchRecords on the
  // owning document. The window/document may already be torn down (tab close,
  // navigation, process shutdown) — bail safely if so.
  WindowGlobalChild* wgc = static_cast<WindowGlobalChild*>(Manager());
  if (!wgc) {
    return;
  }
  nsGlobalWindowInner* window = wgc->GetWindowGlobal();
  if (!window) {
    return;
  }
  Document* doc = window->GetExtantDoc();
  if (!doc) {
    return;
  }
  SpeculationRulesManager* srm = doc->GetSpeculationRulesManager();
  if (!srm) {
    return;
  }
  srm->RemoveRecord(this);
}

}  // namespace mozilla::dom
