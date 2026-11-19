/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsProgressFrame.h"

#include <algorithm>

#include "mozilla/PresShell.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/HTMLMeterElement.h"
#include "mozilla/dom/HTMLProgressElement.h"
#include "nsContentCreatorFunctions.h"
#include "nsFontMetrics.h"
#include "nsGkAtoms.h"
#include "nsIContent.h"
#include "nsLayoutUtils.h"
#include "nsNodeInfoManager.h"
#include "nsPresContext.h"

using namespace mozilla;
using namespace mozilla::dom;

nsIFrame* NS_NewProgressFrame(PresShell* aPresShell, ComputedStyle* aStyle) {
  return new nsProgressFrame(aStyle, aPresShell->GetPresContext(),
                             nsProgressFrame::Type::Progress);
}

nsIFrame* NS_NewMeterFrame(PresShell* aPresShell, ComputedStyle* aStyle) {
  return new nsProgressFrame(aStyle, aPresShell->GetPresContext(),
                             nsProgressFrame::Type::Meter);
}

NS_IMPL_FRAMEARENA_HELPERS(nsProgressFrame)

nsProgressFrame::nsProgressFrame(ComputedStyle* aStyle,
                                 nsPresContext* aPresContext, Type aType)
    : nsContainerFrame(aStyle, aPresContext, kClassID), mType(aType) {}

nsProgressFrame::~nsProgressFrame() = default;

void nsProgressFrame::Destroy(DestroyContext& aContext) {
  NS_ASSERTION(!GetPrevContinuation(),
               "nsProgressFrame should not have continuations; if it does we "
               "need to call RegUnregAccessKey only for the first.");
  aContext.AddAnonymousContent(mBarDiv.forget());
  nsContainerFrame::Destroy(aContext);
}

nsresult nsProgressFrame::CreateAnonymousContent(
    nsTArray<ContentInfo>& aElements) {
  // Create the progress bar div.
  nsCOMPtr<Document> doc = mContent->GetComposedDoc();
  mBarDiv = doc->CreateHTMLElement(nsGkAtoms::div);

  if (StaticPrefs::layout_css_modern_range_pseudos_enabled()) {
    // TODO(emilio): Create also a slider-track pseudo-element.
    mBarDiv->SetPseudoElementType(PseudoStyleType::SliderFill);
  } else {
    // Associate ::-moz-{progress,meter}-bar pseudo-element to the anon child.
    mBarDiv->SetPseudoElementType(mType == Type::Progress
                                      ? PseudoStyleType::MozProgressBar
                                      : PseudoStyleType::MozMeterBar);
  }

  // XXX(Bug 1631371) Check if this should use a fallible operation as it
  // pretended earlier, or change the return type to void.
  aElements.AppendElement(mBarDiv);

  return NS_OK;
}

void nsProgressFrame::AppendAnonymousContentTo(nsTArray<nsIContent*>& aElements,
                                               uint32_t aFilter) {
  if (mBarDiv) {
    aElements.AppendElement(mBarDiv);
  }
}

NS_QUERYFRAME_HEAD(nsProgressFrame)
  NS_QUERYFRAME_ENTRY(nsProgressFrame)
  NS_QUERYFRAME_ENTRY(nsIAnonymousContentCreator)
NS_QUERYFRAME_TAIL_INHERITING(nsContainerFrame)

void nsProgressFrame::BuildDisplayList(nsDisplayListBuilder* aBuilder,
                                       const nsDisplayListSet& aLists) {
  if (IsThemed()) {
    DisplayBorderBackgroundOutline(aBuilder, aLists);
  } else {
    BuildDisplayListForInline(aBuilder, aLists);
  }
}

void nsProgressFrame::Reflow(nsPresContext* aPresContext,
                             ReflowOutput& aDesiredSize,
                             const ReflowInput& aReflowInput,
                             nsReflowStatus& aStatus) {
  MarkInReflow();
  DO_GLOBAL_REFLOW_COUNT("nsProgressFrame");
  MOZ_ASSERT(aStatus.IsEmpty(), "Caller should pass a fresh reflow status!");
  MOZ_ASSERT(mBarDiv, "Progress bar div must exist!");
  NS_ASSERTION(!GetPrevContinuation(),
               "nsProgressFrame should not have continuations; if it does we "
               "need to call RegUnregAccessKey only for the first.");

  const auto wm = aReflowInput.GetWritingMode();
  const auto contentBoxSize = aReflowInput.ComputedSizeWithBSizeFallback(
      [&] { return DefaultSize().BSize(wm); });
  aDesiredSize.SetSize(
      wm,
      contentBoxSize + aReflowInput.ComputedLogicalBorderPadding(wm).Size(wm));
  aDesiredSize.SetOverflowAreasToDesiredBounds();

  for (nsIFrame* childFrame : PrincipalChildList()) {
    ReflowChildFrame(childFrame, aPresContext, aReflowInput, contentBoxSize,
                     aStatus);
    ConsiderChildOverflow(aDesiredSize.mOverflowAreas, childFrame);
  }

  FinishAndStoreOverflow(&aDesiredSize);

  aStatus.Reset();  // This type of frame can't be split.
}

LogicalSide nsProgressFrame::LogicalStartSide(bool aIsVertical,
                                              WritingMode aWM) {
  // The bar begins at the inline-start side if it goes along the inline axis.
  // Otherwise, it begins at the block-start side in vertical writing modes, and
  // at the bottom (block-end) side in horizontal ones.
  if (aIsVertical == aWM.IsVertical()) {
    return LogicalSide::IStart;
  }
  return aWM.IsVertical() ? LogicalSide::BStart : LogicalSide::BEnd;
}

void nsProgressFrame::ReflowChildFrame(nsIFrame* aChild,
                                       nsPresContext* aPresContext,
                                       const ReflowInput& aReflowInput,
                                       const LogicalSize& aParentContentBoxSize,
                                       nsReflowStatus& aStatus) {
  MOZ_ASSERT(aChild == mBarDiv->GetPrimaryFrame() ||
             aChild->IsPlaceholderFrame());
  // TODO: Maybe we should enforce that the bar has the same WM as the parent?
  // That'd simplify a bit the logic here...
  const WritingMode parentWM = aReflowInput.GetWritingMode();
  const WritingMode wm = aChild->GetWritingMode();
  const LogicalSize parentSize = aParentContentBoxSize.ConvertTo(wm, parentWM);
  const nsSize containerSize =
      (aParentContentBoxSize +
       aReflowInput.ComputedLogicalBorderPadding(parentWM).Size(parentWM))
          .GetPhysicalSize(parentWM);
  const LogicalSize availSize(wm, parentSize.ISize(wm), NS_UNCONSTRAINEDSIZE);
  ReflowInput reflowInput(aPresContext, aReflowInput, aChild, availSize,
                          Some(parentSize));

  const LogicalSide startSide =
      LogicalStartSide(ResolvedOrientationIsVertical(), wm);
  const bool inlineAxis = IsInline(startSide);

  double position =
      mType == Type::Progress
          ? static_cast<HTMLProgressElement*>(GetContent())->Position()
          : static_cast<HTMLMeterElement*>(GetContent())->Position();

  // The bar size is fixed in these cases:
  // - the progress position is determined: the bar size is fixed according
  //   to it's value.
  // - the progress position is indeterminate and the bar appearance should be
  //   shown as native: the bar size is forced to 100%.
  // Otherwise (when the progress is indeterminate and the bar appearance isn't
  // native), the bar size isn't fixed and can be set by the author.
  Maybe<nscoord> fixedSize;
  if (position != -1 || ShouldUseNativeStyle()) {
    nscoord size = inlineAxis ? parentSize.ISize(wm) : parentSize.BSize(wm);
    // Force the bar's size to match the current progress.
    // When indeterminate, the progress' size will be 100%.
    if (position >= 0.0 || mType == Type::Meter) {
      size = NSToCoordRound(size * position);
    }
    fixedSize.emplace(size);
    const LogicalMargin mbp = reflowInput.ComputedLogicalMargin(wm) +
                              reflowInput.ComputedLogicalBorderPadding(wm);
    if (inlineAxis) {
      size -= mbp.IStartEnd(wm);
      reflowInput.SetComputedISize(std::max(size, 0));
    } else {
      size -= mbp.BStartEnd(wm);
      reflowInput.SetComputedBSize(std::max(size, 0));
    }
  }

  // Start at the parent content edge plus child margin.
  const LogicalMargin parentBP = aReflowInput.ComputedLogicalBorderPadding(wm);
  const LogicalMargin margin = reflowInput.ComputedLogicalMargin(wm);
  LogicalPoint pos(wm, parentBP.IStart(wm) + margin.IStart(wm),
                   parentBP.BStart(wm) + margin.BStart(wm));

  ReflowOutput barDesiredSize(reflowInput);
  ReflowChild(aChild, aPresContext, barDesiredSize, reflowInput, wm, pos,
              containerSize, ReflowChildFlags::Default, aStatus);
  if (startSide == LogicalSide::BEnd) {
    pos.B(wm) +=
        parentSize.BSize(wm) -
        fixedSize.valueOr(barDesiredSize.BSize(wm) + margin.BStartEnd(wm));
  }
  FinishReflowChild(aChild, aPresContext, barDesiredSize, &reflowInput, wm, pos,
                    containerSize, ReflowChildFlags::Default);
}

nsresult nsProgressFrame::AttributeChanged(int32_t aNameSpaceID,
                                           nsAtom* aAttribute,
                                           AttrModType aModType) {
  NS_ASSERTION(mBarDiv, "Progress bar div must exist!");

  if (aNameSpaceID == kNameSpaceID_None &&
      (aAttribute == nsGkAtoms::value || aAttribute == nsGkAtoms::max ||
       aAttribute == nsGkAtoms::min)) {
    auto* presShell = PresShell();
    for (auto* childFrame : PrincipalChildList()) {
      presShell->FrameNeedsReflow(childFrame, IntrinsicDirty::None,
                                  NS_FRAME_IS_DIRTY);
    }
    InvalidateFrame();
  }

  return nsContainerFrame::AttributeChanged(aNameSpaceID, aAttribute, aModType);
}

LogicalSize nsProgressFrame::DefaultSize() const {
  const auto wm = GetWritingMode();
  nscoord em = OneEmInAppUnits();
  LogicalSize size(wm, em, em);
  nscoord& longAxis = ResolvedOrientationIsVertical() == wm.IsVertical()
                          ? size.ISize(wm)
                          : size.BSize(wm);
  longAxis *= mType == Type::Progress ? 10 : 5;
  return size;
}

nscoord nsProgressFrame::IntrinsicISize(const IntrinsicSizeInput& aInput,
                                        IntrinsicISizeType aType) {
  return DefaultSize().ISize(GetWritingMode());
}

bool nsProgressFrame::ShouldUseNativeStyle() const {
  return StyleDisplay()->HasNativeAppearance() &&
         !Style()->HasAuthorOrUserSpecifiedBorderOrBackground();
}
