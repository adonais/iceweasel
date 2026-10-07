/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/MozPrintCallbackRunner.h"

#include "mozilla/dom/HTMLCanvasElement.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/gfx/DrawEventRecorder.h"
#include "nsHTMLCanvasFrame.h"
#include "nsICanvasRenderingContextInternal.h"
#include "nsIFrame.h"
#include "nsPageFrame.h"
#include "nsSubDocumentFrame.h"

namespace mozilla {

using dom::HTMLCanvasElement;

MozPrintCallbackRunner::MozPrintCallbackRunner() = default;
MozPrintCallbackRunner::MozPrintCallbackRunner(MozPrintCallbackRunner&&) =
    default;
MozPrintCallbackRunner::~MozPrintCallbackRunner() { Reset(); }

void MozPrintCallbackRunner::CollectCanvases(nsIFrame* aFrame) {
  if (!aFrame) {
    return;
  }
  for (const auto& childList : aFrame->ChildLists()) {
    for (nsIFrame* child : childList.mList) {
      // Pages skipped by a custom range aren't meant to be printed, so don't
      // waste time rendering their canvas descendants.
      if (child->IsPageFrame() &&
          child->HasAnyStateBits(NS_PAGE_SKIPPED_BY_CUSTOM_RANGE)) {
        continue;
      }

      if (nsHTMLCanvasFrame* canvasFrame = do_QueryFrame(child)) {
        auto* canvas =
            HTMLCanvasElement::FromNodeOrNull(canvasFrame->GetContent());
        if (canvas && canvas->GetMozPrintCallback()) {
          mCanvases.AppendElement(canvas);
          continue;
        }
      }

      if (!child->PrincipalChildList().FirstChild()) {
        if (nsSubDocumentFrame* subdocumentFrame = do_QueryFrame(child)) {
          child = subdocumentFrame->GetSubdocumentRootFrame();
        }
      }
      CollectCanvases(child);
    }
  }
}

void MozPrintCallbackRunner::DispatchCallbacks(gfx::DrawTarget* aReferenceDt,
                                               nsITimerCallback* aCallback) {
  for (HTMLCanvasElement* canvas : Reversed(mCanvases)) {
    CSSIntSize size = canvas->GetSize();
    RefPtr recorder = MakeAndAddRef<gfx::DrawEventRecorderMemory>(nullptr);
    RefPtr<gfx::DrawTarget> canvasTarget =
        gfx::Factory::CreateRecordingDrawTarget(
            recorder, aReferenceDt,
            gfx::IntRect(gfx::IntPoint(), size.ToUnknownSize()));
    if (!canvasTarget) {
      continue;
    }

    nsICanvasRenderingContextInternal* ctx = canvas->GetCurrentContext();
    if (!ctx) {
      continue;
    }

    ctx->InitializeWithDrawTarget(nullptr, WrapNotNull(canvasTarget));

    // Note: Other than drawing to our CanvasRenderingContext2D, the callback
    // cannot access or mutate our static clone document.  It is evaluated in
    // its original context (the window of the original document) of course,
    // and our canvas has a strong ref to the original HTMLCanvasElement (in
    // mOriginalCanvas) so that if the callback calls GetCanvas() on our
    // CanvasRenderingContext2D (passed to it via a MozCanvasPrintState
    // argument) it will be given the original 'canvas' element.
    canvas->DispatchPrintCallback(aCallback);
  }
}

bool MozPrintCallbackRunner::AreCallbacksDone() const {
  for (HTMLCanvasElement* canvas : mCanvases) {
    if (!canvas->IsPrintCallbackDone()) {
      return false;
    }
  }
  return true;
}

void MozPrintCallbackRunner::Reset() {
  for (HTMLCanvasElement* canvas : mCanvases) {
    canvas->ResetPrintCallback();
  }
  mCanvases.Clear();
}

}  // namespace mozilla
