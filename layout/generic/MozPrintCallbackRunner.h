/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_MozPrintCallbackRunner_h
#define mozilla_MozPrintCallbackRunner_h

#include "nsTArray.h"

class nsIFrame;
class nsITimerCallback;

namespace mozilla {
namespace dom {
class HTMLCanvasElement;
}
namespace gfx {
class DrawTarget;
}

// Runs the mozPrintCallback of the <canvas> elements in a frame tree that is
// being printed, and keeps track of their completion.
class MozPrintCallbackRunner final {
 public:
  MozPrintCallbackRunner();
  MozPrintCallbackRunner(MozPrintCallbackRunner&&);
  ~MozPrintCallbackRunner();

  // Collects the <canvas> elements with a mozPrintCallback in aFrame's
  // subtree, recursing across in-process subdocs.
  void CollectCanvases(nsIFrame* aFrame);

  bool HasCanvases() const { return !mCanvases.IsEmpty(); }

  // Redirects each canvas' drawing to a recording draw target created from
  // aReferenceDt and dispatches its mozPrintCallback. aCallback is notified
  // with `nullptr` each time one of the callbacks finishes.
  void DispatchCallbacks(gfx::DrawTarget* aReferenceDt,
                         nsITimerCallback* aCallback);

  bool AreCallbacksDone() const;

  // Resets the print state of the canvases and forgets about them.
  void Reset();

 private:
  nsTArray<RefPtr<dom::HTMLCanvasElement>> mCanvases;
};

}  // namespace mozilla

#endif  // mozilla_MozPrintCallbackRunner_h
