/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsTextControlFrame.h"

#include <algorithm>

#include "ErrorList.h"
#include "PseudoStyleType.h"
#include "gfxContext.h"
#include "mozilla/EventStateManager.h"
#include "mozilla/IMEContentObserver.h"
#include "mozilla/IMEStateManager.h"
#include "mozilla/PresShell.h"
#include "mozilla/PresState.h"
#include "mozilla/ScrollContainerFrame.h"
#include "mozilla/StaticPrefs_layout.h"
#include "mozilla/TextEditor.h"
#include "mozilla/dom/HTMLInputElement.h"
#include "mozilla/dom/HTMLTextAreaElement.h"
#include "mozilla/dom/ScriptSettings.h"
#include "mozilla/dom/Selection.h"
#include "mozilla/dom/Text.h"
#include "nsAttrValueInlines.h"
#include "nsCOMPtr.h"
#include "nsCaret.h"
#include "nsContentUtils.h"
#include "nsDisplayList.h"
#include "nsFocusManager.h"
#include "nsFontMetrics.h"
#include "nsFrameSelection.h"
#include "nsGenericHTMLElement.h"
#include "nsGkAtoms.h"
#include "nsIContent.h"
#include "nsIEditor.h"
#include "nsILayoutHistoryState.h"
#include "nsINode.h"
#include "nsLayoutUtils.h"
#include "nsPIDOMWindow.h"  //needed for notify selection changed to update the menus ect.
#include "nsPresContext.h"
#include "nsRange.h"  //for selection setting helper func

using namespace mozilla;
using namespace mozilla::dom;

nsIFrame* NS_NewTextControlFrame(PresShell* aPresShell, ComputedStyle* aStyle) {
  return new (aPresShell)
      nsTextControlFrame(aStyle, aPresShell->GetPresContext());
}

NS_IMPL_FRAMEARENA_HELPERS(nsTextControlFrame)

NS_QUERYFRAME_HEAD(nsTextControlFrame)
  NS_QUERYFRAME_ENTRY(nsTextControlFrame)
  NS_QUERYFRAME_ENTRY(nsIStatefulFrame)
NS_QUERYFRAME_TAIL_INHERITING(nsContainerFrame)

#ifdef ACCESSIBILITY
a11y::AccType nsTextControlFrame::AccessibleType() {
  if (ControlElement()->ControlType() == FormControlType::InputNumber) {
    return a11y::eHTMLSpinnerType;
  }
  return a11y::eHTMLTextFieldType;
}
#endif

nsTextControlFrame::nsTextControlFrame(ComputedStyle* aStyle,
                                       nsPresContext* aPresContext,
                                       nsIFrame::ClassID aClassID)
    : nsContainerFrame(aStyle, aPresContext, aClassID) {}

nsTextControlFrame::~nsTextControlFrame() = default;

ScrollContainerFrame* nsTextControlFrame::GetScrollTargetFrame() const {
  auto* root = GetRootNode();
  if (!root) {
    return nullptr;
  }
  return do_QueryFrame(root->GetPrimaryFrame());
}

void nsTextControlFrame::Destroy(DestroyContext& aContext) {
  if (auto* ts = ControlElement()->GetTextControlState()) {
    ts->DeinitSelection();
  }
  nsContainerFrame::Destroy(aContext);
}

LogicalSize nsTextControlFrame::CalcIntrinsicSize(gfxContext* aRenderingContext,
                                                  WritingMode aWM) const {
  LogicalSize intrinsicSize(aWM);
  const float inflation = nsLayoutUtils::FontSizeInflationFor(this);
  RefPtr<nsFontMetrics> fontMet =
      nsLayoutUtils::GetFontMetricsForFrame(this, inflation);
  const nscoord lineHeight = ReflowInput::CalcLineHeight(
      *Style(), PresContext(), GetContent(), NS_UNCONSTRAINEDSIZE, inflation);
  // Use the larger of the font's "average" char width or the width of the
  // zero glyph (if present) as the basis for resolving the size attribute.
  const nscoord charWidth =
      std::max(fontMet->ZeroOrAveCharWidth(), fontMet->AveCharWidth());
  const nscoord charMaxAdvance = fontMet->MaxAdvance();

  // Initialize based on the width in characters.
  const Maybe<int32_t> maybeCols = GetCols();
  const int32_t cols = maybeCols.valueOr(TextControlElement::DEFAULT_COLS);
  intrinsicSize.ISize(aWM) = cols * charWidth;

  // If we do not have what appears to be a fixed-width font, add a "slop"
  // amount based on the max advance of the font (clamped to twice charWidth,
  // because some fonts have a few extremely-wide outliers that would result
  // in excessive width here; e.g. the triple-emdash ligature in SFNS Text),
  // minus 4px. This helps avoid input fields becoming unusably narrow with
  // small size values.
  if (charMaxAdvance - charWidth > AppUnitsPerCSSPixel()) {
    nscoord internalPadding =
        std::max(0, std::min(charMaxAdvance, charWidth * 2) -
                        nsPresContext::CSSPixelsToAppUnits(4));
    internalPadding = RoundToMultiple(internalPadding, AppUnitsPerCSSPixel());
    intrinsicSize.ISize(aWM) += internalPadding;
  }

  // Increment width with cols * letter-spacing.
  {
    const auto& letterSpacing = StyleText()->mLetterSpacing;
    if (!letterSpacing.IsDefinitelyZero()) {
      intrinsicSize.ISize(aWM) +=
          cols * letterSpacing.Resolve(fontMet->EmHeight());
    }
  }

  // Set the height equal to total number of rows (times the height of each
  // line, of course)
  intrinsicSize.BSize(aWM) = lineHeight * GetRows();

  // Add in the size of the scrollbars for textarea
  if (IsTextArea()) {
    if (ScrollContainerFrame* scrollContainerFrame = GetScrollTargetFrame()) {
      LogicalMargin scrollbarSizes(
          aWM, scrollContainerFrame->GetDesiredScrollbarSizes());
      intrinsicSize.ISize(aWM) += scrollbarSizes.IStartEnd(aWM);

      // We only include scrollbar-thickness in our BSize if the scrollbar on
      // that side is explicitly forced-to-be-present.
      const bool includeScrollbarBSize = [&] {
        if (!StaticPrefs::
                layout_forms_textarea_sizing_excludes_auto_scrollbar_enabled()) {
          return true;
        }
        auto overflow = aWM.IsVertical() ? StyleDisplay()->mOverflowY
                                         : StyleDisplay()->mOverflowX;
        return overflow == StyleOverflow::Scroll;
      }();
      if (includeScrollbarBSize) {
        intrinsicSize.BSize(aWM) += scrollbarSizes.BStartEnd(aWM);
      }
    }
  }

  // Add the inline size of the button if our char size is explicit, so as to
  // make sure to make enough space for it.
  if (maybeCols.isSome()) {
    if (auto* button = GetButton(); button && button->GetPrimaryFrame()) {
      const IntrinsicSizeInput input(aRenderingContext, Nothing(), Nothing());
      intrinsicSize.ISize(aWM) += button->GetPrimaryFrame()->GetMinISize(input);
    }
  }

  return intrinsicSize;
}

void nsTextControlFrame::Init(nsIContent* aContent, nsContainerFrame* aParent,
                              nsIFrame* aPrevInFlow) {
  nsContainerFrame::Init(aContent, aParent, aPrevInFlow);
}

nscoord nsTextControlFrame::IntrinsicISize(const IntrinsicSizeInput& aInput,
                                           IntrinsicISizeType aType) {
  // Our min inline size is just our preferred inline-size if we have auto
  // inline size.
  WritingMode wm = GetWritingMode();
  return CalcIntrinsicSize(aInput.mContext, wm).ISize(wm);
}

Maybe<nscoord> nsTextControlFrame::ComputeBaseline(
    const nsIFrame* aFrame, const ReflowInput& aReflowInput,
    bool aForSingleLineControl) {
  // If we're layout-contained, we have no baseline.
  if (aReflowInput.mStyleDisplay->IsContainLayout()) {
    return Nothing();
  }
  WritingMode wm = aReflowInput.GetWritingMode();

  nscoord lineHeight = aReflowInput.ComputedBSize();
  if (!aForSingleLineControl || lineHeight == NS_UNCONSTRAINEDSIZE) {
    lineHeight = aReflowInput.ApplyMinMaxBSize(aReflowInput.GetLineHeight());
  }
  RefPtr<nsFontMetrics> fontMet =
      nsLayoutUtils::GetInflatedFontMetricsForFrame(aFrame);
  return Some(nsLayoutUtils::GetCenteredFontBaseline(fontMet, lineHeight,
                                                     wm.IsLineInverted()) +
              aReflowInput.ComputedLogicalBorderPadding(wm).BStart(wm));
}

void nsTextControlFrame::Reflow(nsPresContext* aPresContext,
                                ReflowOutput& aDesiredSize,
                                const ReflowInput& aReflowInput,
                                nsReflowStatus& aStatus) {
  MarkInReflow();
  DO_GLOBAL_REFLOW_COUNT("nsTextControlFrame");
  MOZ_ASSERT(aStatus.IsEmpty(), "Caller should pass a fresh reflow status!");

  // set values of reflow's out parameters
  WritingMode wm = aReflowInput.GetWritingMode();
  const auto contentBoxSize = aReflowInput.ComputedSizeWithBSizeFallback([&] {
    return CalcIntrinsicSize(aReflowInput.mRenderingContext, wm).BSize(wm);
  });
  aDesiredSize.SetSize(
      wm,
      contentBoxSize + aReflowInput.ComputedLogicalBorderPadding(wm).Size(wm));

  {
    // Calculate the baseline and store it in mFirstBaseline.
    auto baseline =
        ComputeBaseline(this, aReflowInput, IsSingleLineTextControl());
    mFirstBaseline = baseline.valueOr(NS_INTRINSIC_ISIZE_UNKNOWN);
    if (baseline) {
      aDesiredSize.SetBlockStartAscent(*baseline);
    }
  }

  // overflow handling
  aDesiredSize.SetOverflowAreasToDesiredBounds();

  nsIFrame* buttonBox = [&]() -> nsIFrame* {
    nsIFrame* last = mFrames.LastChild();
    if (!last || !IsButtonBox(last)) {
      return nullptr;
    }
    return last;
  }();

  // Reflow the button box first, so that we can use its size for the other
  // frames.
  nscoord buttonBoxISize = 0;
  if (buttonBox) {
    ReflowTextControlChild(buttonBox, aPresContext, aReflowInput, aStatus,
                           aDesiredSize, contentBoxSize, buttonBoxISize);
  }

  // perform reflow on all kids
  nsIFrame* kid = mFrames.FirstChild();
  while (kid) {
    if (kid != buttonBox) {
      MOZ_ASSERT(!IsButtonBox(kid),
                 "Should only have one button box, and should be last");
      ReflowTextControlChild(kid, aPresContext, aReflowInput, aStatus,
                             aDesiredSize, contentBoxSize, buttonBoxISize);
    }
    kid = kid->GetNextSibling();
  }

  // take into account css properties that affect overflow handling
  FinishAndStoreOverflow(&aDesiredSize);

  aStatus.Reset();  // This type of frame can't be split.
}

void nsTextControlFrame::ReflowTextControlChild(
    nsIFrame* aKid, nsPresContext* aPresContext,
    const ReflowInput& aReflowInput, nsReflowStatus& aStatus,
    ReflowOutput& aParentDesiredSize, const LogicalSize& aParentContentBoxSize,
    nscoord& aButtonBoxISize) {
  const WritingMode outerWM = aReflowInput.GetWritingMode();
  // compute available size and frame offsets for child
  const WritingMode wm = aKid->GetWritingMode();
  const auto parentPadding = aReflowInput.ComputedLogicalPadding(wm);
  const LogicalSize contentBoxSize =
      aParentContentBoxSize.ConvertTo(wm, outerWM);
  const LogicalSize paddingBoxSize = contentBoxSize + parentPadding.Size(wm);
  const LogicalSize borderBoxSize =
      paddingBoxSize + aReflowInput.ComputedLogicalBorder(wm).Size(wm);
  const bool singleLine = IsSingleLineTextControl();
  const bool isButtonBox = IsButtonBox(aKid);
  LogicalSize availSize =
      !isButtonBox && singleLine ? contentBoxSize : paddingBoxSize;
  availSize.BSize(wm) = NS_UNCONSTRAINEDSIZE;
  ReflowInput kidReflowInput(aPresContext, aReflowInput, aKid, availSize,
                             Nothing(), ReflowInput::InitFlag::CallerWillInit);

  // Override padding with our computed padding in case we got it from theming
  // or percentage, if we're not the button box.
  auto overridePadding = isButtonBox ? Nothing() : Some(parentPadding);
  if (!isButtonBox && singleLine) {
    // Button box respects inline-end-padding, so we don't need to.
    // inline-padding is not propagated to the scroller for single-line text
    // controls.
    overridePadding->IStart(wm) = overridePadding->IEnd(wm) = 0;
  }

  // We want to let our button box fill the frame in the block axis, up to the
  // edge of the control's border. So, we use the control's padding-box as the
  // containing block size for our button box.
  auto overrideCBSize = isButtonBox ? Some(paddingBoxSize) : Nothing();
  kidReflowInput.Init(aPresContext, overrideCBSize, Nothing(), overridePadding);

  LogicalPoint position(wm);
  if (!isButtonBox) {
    MOZ_ASSERT(wm == outerWM || aKid->IsPlaceholderFrame(),
               "Shouldn't have to care about orthogonal "
               "writing-modes and such inside the control, "
               "except for the number spin-box which forces "
               "horizontal-tb");

    const auto& border = aReflowInput.ComputedLogicalBorder(wm);

    // Offset the frame by the size of the parent's border. Note that we don't
    // have to account for the parent's padding here, because this child
    // actually "inherits" that padding and manages it on behalf of the parent.
    position.B(wm) = border.BStart(wm);
    position.I(wm) = border.IStart(wm);
    if (singleLine) {
      position.I(wm) += parentPadding.IStart(wm);
    }

    // Set computed width and computed height for the child (the button box is
    // the only exception, which has an auto size).
    kidReflowInput.SetComputedISize(
        std::max(0, aReflowInput.ComputedISize() - aButtonBoxISize));
    kidReflowInput.SetComputedBSize(contentBoxSize.BSize(wm));
  }

  // reflow the child
  ReflowOutput desiredSize(aReflowInput);
  const nsSize containerSize = borderBoxSize.GetPhysicalSize(wm);
  ReflowChild(aKid, aPresContext, desiredSize, kidReflowInput, wm, position,
              containerSize, ReflowChildFlags::Default, aStatus);

  if (isButtonBox) {
    const auto& bp = aReflowInput.ComputedLogicalBorderPadding(outerWM);
    auto size = desiredSize.Size(outerWM);
    // Center button in the block axis of our content box. We do this
    // computation in terms of outerWM for simplicity.
    LogicalRect buttonRect(outerWM);
    buttonRect.BSize(outerWM) = size.BSize(outerWM);
    buttonRect.ISize(outerWM) = size.ISize(outerWM);
    buttonRect.BStart(outerWM) =
        bp.BStart(outerWM) +
        (aParentContentBoxSize.BSize(outerWM) - size.BSize(outerWM)) / 2;
    // Align to the inline-end of the content box.
    buttonRect.IStart(outerWM) =
        bp.IStart(outerWM) + aReflowInput.ComputedISize() - size.ISize(outerWM);
    buttonRect = buttonRect.ConvertTo(wm, outerWM, containerSize);
    position = buttonRect.Origin(wm);
    aButtonBoxISize = size.ISize(outerWM);
  }

  // place the child
  FinishReflowChild(aKid, aPresContext, desiredSize, &kidReflowInput, wm,
                    position, containerSize, ReflowChildFlags::Default);

  // consider the overflow
  aParentDesiredSize.mOverflowAreas.UnionWith(desiredSize.mOverflowAreas);
}

void nsTextControlFrame::HandleReadonlyOrDisabledChange() {
  RefPtr<TextControlElement> el = ControlElement();
  const RefPtr<TextEditor> editor = el->GetExtantTextEditor();
  if (!editor) {
    return;
  }
  nsISelectionController* const selCon = el->GetSelectionController();
  if (!selCon) {
    return;
  }
  if (el->IsDisabledOrReadOnly()) {
    if (nsFocusManager::GetFocusedElementStatic() == el) {
      selCon->SetCaretEnabled(false);
    }
    editor->AddFlags(nsIEditor::eEditorReadonlyMask);
  } else {
    if (nsFocusManager::GetFocusedElementStatic() == el) {
      selCon->SetCaretEnabled(true);
    }
    editor->RemoveFlags(nsIEditor::eEditorReadonlyMask);
  }
}

void nsTextControlFrame::ElementStateChanged(dom::ElementState aStates) {
  if (aStates.HasAtLeastOneOfStates(dom::ElementState::READONLY |
                                    dom::ElementState::DISABLED)) {
    HandleReadonlyOrDisabledChange();
  }
  return nsContainerFrame::ElementStateChanged(aStates);
}

/// END NSIFRAME OVERLOADS

// NOTE(emilio): This is needed because the root->primary frame map is not set
// up by the time this is called.
static nsIFrame* FindRootNodeFrame(const nsFrameList& aChildList,
                                   const nsIContent* aRoot) {
  for (nsIFrame* f : aChildList) {
    if (f->GetContent() == aRoot) {
      return f;
    }
    if (nsIFrame* root = FindRootNodeFrame(f->PrincipalChildList(), aRoot)) {
      return root;
    }
  }
  return nullptr;
}
void nsTextControlFrame::SetInitialChildList(ChildListID aListID,
                                             nsFrameList&& aChildList) {
  nsContainerFrame::SetInitialChildList(aListID, std::move(aChildList));
  if (aListID != FrameChildListID::Principal) {
    return;
  }

  // Mark the scroll frame as being a reflow root. This will allow incremental
  // reflows to be initiated at the scroll frame, rather than descending from
  // the root frame of the frame hierarchy.
  if (nsIFrame* frame =
          FindRootNodeFrame(PrincipalChildList(), GetRootNode())) {
    frame->AddStateBits(NS_FRAME_REFLOW_ROOT);

    if (auto* ts = ControlElement()->GetTextControlState()) {
      ts->InitializeSelection(PresShell());
    }

    bool hasProperty;
    nsPoint contentScrollPos = TakeProperty(ContentScrollPos(), &hasProperty);
    if (hasProperty) {
      // If we have a scroll pos stored to be passed to our anonymous
      // div, do it here!
      nsIStatefulFrame* statefulFrame = do_QueryFrame(frame);
      NS_ASSERTION(statefulFrame,
                   "unexpected type of frame for the anonymous div");
      UniquePtr<PresState> fakePresState = NewPresState();
      fakePresState->scrollState() = contentScrollPos;
      statefulFrame->RestoreState(fakePresState.get());
    }
  } else {
    MOZ_ASSERT(!GetRootNode() || PrincipalChildList().IsEmpty());
  }
}

UniquePtr<PresState> nsTextControlFrame::SaveState() {
  if (nsIStatefulFrame* scrollStateFrame = GetScrollTargetFrame()) {
    return scrollStateFrame->SaveState();
  }

  return nullptr;
}

NS_IMETHODIMP
nsTextControlFrame::RestoreState(PresState* aState) {
  NS_ENSURE_ARG_POINTER(aState);

  if (nsIStatefulFrame* scrollStateFrame = GetScrollTargetFrame()) {
    return scrollStateFrame->RestoreState(aState);
  }

  // Most likely, we don't have our anonymous content constructed yet, which
  // would cause us to end up here.  In this case, we'll just store the scroll
  // pos ourselves, and forward it to the scroll frame later when it's
  // created.
  SetProperty(ContentScrollPos(), aState->scrollState());
  return NS_OK;
}

nsresult nsTextControlFrame::PeekOffset(PeekOffsetStruct* aPos) {
  return NS_ERROR_FAILURE;
}

void nsTextControlFrame::BuildDisplayList(nsDisplayListBuilder* aBuilder,
                                          const nsDisplayListSet& aLists) {
  DO_GLOBAL_REFLOW_COUNT_DSP("nsTextControlFrame");

  DisplayBorderBackgroundOutline(aBuilder, aLists);

  if (HidesContent()) {
    return;
  }

  // Redirect all lists to the Content list so that nothing can escape, ie
  // opacity creating stacking contexts that then get sorted with stacking
  // contexts external to us.
  nsDisplayList* content = aLists.Content();
  nsDisplayListSet set(content, content, content, content, content, content);

  for (auto* kid : mFrames) {
    BuildDisplayListForChild(aBuilder, kid, set);
  }
}

Maybe<nscoord> nsTextControlFrame::GetNaturalBaselineBOffset(
    mozilla::WritingMode aWM, BaselineSharingGroup aBaselineGroup,
    BaselineExportContext aExportContext) const {
  if (!IsSingleLineTextControl()) {
    if (StyleDisplay()->IsContainLayout()) {
      return Nothing{};
    }

    if (aBaselineGroup == BaselineSharingGroup::First) {
      return Some(CSSMinMax(mFirstBaseline, 0, BSize(aWM)));
    }
    // This isn't great, but the content of the root NAC isn't guaranteed
    // to be loaded, so the best we can do is the edge of the border-box.
    if (aWM.IsCentralBaseline()) {
      return Some(BSize(aWM) / 2);
    }
    return Some(0);
  }
  NS_ASSERTION(!IsSubtreeDirty(), "frame must not be dirty");
  return GetSingleLineTextControlBaseline(this, mFirstBaseline, aWM,
                                          aBaselineGroup);
}
