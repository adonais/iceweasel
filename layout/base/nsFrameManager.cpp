/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* storage of the frame tree and information about it */

#include "nsFrameManager.h"

#include "mozilla/AbsoluteContainingBlock.h"
#include "mozilla/ComputedStyle.h"
#include "mozilla/PresShell.h"
#include "mozilla/ScrollContainerFrame.h"
#include "mozilla/ViewportFrame.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "nsContainerFrame.h"
#include "nsContentUtils.h"
#include "nsWindowSizes.h"
#include "plhash.h"

using namespace mozilla;
using namespace mozilla::dom;

//----------------------------------------------------------------------

nsFrameManager::~nsFrameManager() {
  NS_ASSERTION(!mPresShell, "nsFrameManager::Destroy never called");
}

void nsFrameManager::SetRootFrame(ViewportFrame* aRootFrame) {
  MOZ_ASSERT(aRootFrame, "The root frame should be valid!");
  MOZ_ASSERT(!mRootFrame, "We should set a root frame only once!");
  mRootFrame = aRootFrame;
}

void nsFrameManager::Destroy() {
  NS_ASSERTION(mPresShell, "Frame manager already shut down.");

  // Destroy the frame hierarchy.
  mPresShell->SetIgnoreFrameDestruction(true);

  if (mRootFrame) {
    FrameDestroyContext context(mPresShell);
    mRootFrame->Destroy(context);
    mRootFrame = nullptr;
  }

  mPresShell = nullptr;
}

//----------------------------------------------------------------------
void nsFrameManager::AppendFrames(nsContainerFrame* aParentFrame,
                                  FrameChildListID aListID,
                                  nsFrameList&& aFrameList) {
  if (aParentFrame->IsAbsoluteContainer() &&
      aListID == FrameChildListID::Absolute) {
    aParentFrame->GetAbsoluteContainingBlock()->AppendFrames(
        aParentFrame, aListID, std::move(aFrameList));
  } else {
    aParentFrame->AppendFrames(aListID, std::move(aFrameList));
  }
}

void nsFrameManager::InsertFrames(nsContainerFrame* aParentFrame,
                                  FrameChildListID aListID,
                                  nsIFrame* aPrevFrame,
                                  nsFrameList&& aFrameList) {
  MOZ_ASSERT(
      !aPrevFrame ||
          (!aPrevFrame->GetNextContinuation() ||
           (aPrevFrame->GetNextContinuation()->HasAnyStateBits(
                NS_FRAME_IS_OVERFLOW_CONTAINER) &&
            !aPrevFrame->HasAnyStateBits(NS_FRAME_IS_OVERFLOW_CONTAINER))),
      "aPrevFrame must be the last continuation in its chain!");

  if (aParentFrame->IsAbsoluteContainer() &&
      aListID == FrameChildListID::Absolute) {
    aParentFrame->GetAbsoluteContainingBlock()->InsertFrames(
        aParentFrame, aListID, aPrevFrame, std::move(aFrameList));
  } else {
    aParentFrame->InsertFrames(aListID, aPrevFrame, nullptr,
                               std::move(aFrameList));
  }
}

void nsFrameManager::RemoveFrame(DestroyContext& aContext,
                                 FrameChildListID aListID,
                                 nsIFrame* aOldFrame) {
  // In case the reflow doesn't invalidate anything since it just leaves
  // a gap where the old frame was, we invalidate it here.  (This is
  // reasonably likely to happen when removing a last child in a way
  // that doesn't change the size of the parent.)
  // This has to sure to invalidate the entire overflow rect; this
  // is important in the presence of absolute positioning
  aOldFrame->InvalidateFrameForRemoval();

  NS_ASSERTION(!aOldFrame->GetPrevContinuation() ||
                   // exception for
                   // nsCSSFrameConstructor::RemoveFloatingFirstLetterFrames
                   aOldFrame->IsTextFrame(),
               "Must remove first continuation.");
  NS_ASSERTION(!(aOldFrame->HasAnyStateBits(NS_FRAME_OUT_OF_FLOW) &&
                 aOldFrame->GetPlaceholderFrame()),
               "Must call RemoveFrame on placeholder for out-of-flows.");
  nsContainerFrame* parentFrame = aOldFrame->GetParent();
  if (parentFrame->IsAbsoluteContainer() &&
      aListID == FrameChildListID::Absolute) {
    parentFrame->GetAbsoluteContainingBlock()->RemoveFrame(aContext, aListID,
                                                           aOldFrame);
  } else {
    parentFrame->RemoveFrame(aContext, aListID, aOldFrame);
  }
}

void nsFrameManager::AddSizeOfIncludingThis(nsWindowSizes& aSizes) const {
  aSizes.mLayoutPresShellSize += aSizes.mState.mMallocSizeOf(this);
}
