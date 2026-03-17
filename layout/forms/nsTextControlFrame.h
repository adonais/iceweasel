/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsTextControlFrame_h_
#define nsTextControlFrame_h_

#include "mozilla/Attributes.h"
#include "mozilla/TextControlElement.h"
#include "nsContainerFrame.h"
#include "nsIContent.h"
#include "nsIStatefulFrame.h"

namespace mozilla {
class ScrollContainerFrame;
enum class PseudoStyleType : uint8_t;
namespace dom {
class Element;
}  // namespace dom
}  // namespace mozilla

class nsTextControlFrame : public nsContainerFrame, public nsIStatefulFrame {
  using Element = mozilla::dom::Element;

 public:
  NS_DECL_FRAMEARENA_HELPERS(nsTextControlFrame)

  NS_DECLARE_FRAME_PROPERTY_SMALL_VALUE(ContentScrollPos, nsPoint)

 protected:
  nsTextControlFrame(ComputedStyle*, nsPresContext*, nsIFrame::ClassID);

 public:
  explicit nsTextControlFrame(ComputedStyle* aStyle,
                              nsPresContext* aPresContext)
      : nsTextControlFrame(aStyle, aPresContext, kClassID) {}

  virtual ~nsTextControlFrame();

  /**
   * Destroy() causes preparing to destroy editor and that may cause running
   * selection listeners of spellchecker selection and document state listeners.
   * Not sure whether the former does something or not, but nobody should run
   * content script.  The latter is currently only FinderHighlighter to clean up
   * its fields at destruction.  Thus, the latter won't run content script too.
   * Therefore, this won't run unsafe script.
   */
  MOZ_CAN_RUN_SCRIPT_BOUNDARY void Destroy(DestroyContext&) override;

  mozilla::ScrollContainerFrame* GetScrollTargetFrame() const override;

  nscoord IntrinsicISize(const mozilla::IntrinsicSizeInput& aInput,
                         mozilla::IntrinsicISizeType aType) override;

  void Reflow(nsPresContext* aPresContext, ReflowOutput& aDesiredSize,
              const ReflowInput& aReflowInput,
              nsReflowStatus& aStatus) override;

  Maybe<nscoord> GetNaturalBaselineBOffset(
      mozilla::WritingMode aWM, BaselineSharingGroup aBaselineGroup,
      BaselineExportContext aExportContext) const override;

  BaselineSharingGroup GetDefaultBaselineSharingGroup() const override {
    return BaselineSharingGroup::Last;
  }

  static Maybe<nscoord> GetSingleLineTextControlBaseline(
      const nsIFrame* aFrame, nscoord aFirstBaseline, mozilla::WritingMode aWM,
      BaselineSharingGroup aBaselineGroup) {
    if (aFrame->StyleDisplay()->IsContainLayout()) {
      return Nothing{};
    }
    NS_ASSERTION(aFirstBaseline != NS_INTRINSIC_ISIZE_UNKNOWN,
                 "please call Reflow before asking for the baseline");
    return mozilla::Some(aBaselineGroup == BaselineSharingGroup::First
                             ? aFirstBaseline
                             : aFrame->BSize(aWM) - aFirstBaseline);
  }

#ifdef ACCESSIBILITY
  mozilla::a11y::AccType AccessibleType() override;
#endif

#ifdef DEBUG_FRAME_DUMP
  nsresult GetFrameName(nsAString& aResult) const override {
    aResult.AssignLiteral("nsTextControlFrame");
    return NS_OK;
  }
#endif

  void SetInitialChildList(ChildListID, nsFrameList&&) override;

  void BuildDisplayList(nsDisplayListBuilder* aBuilder,
                        const nsDisplayListSet& aLists) override;

  nsFrameSelection* GetOwnedFrameSelection() {
    return ControlElement()->GetIndependentFrameSelection();
  }

  //==== NSISTATEFULFRAME

  mozilla::UniquePtr<mozilla::PresState> SaveState() override;
  NS_IMETHOD RestoreState(mozilla::PresState* aState) override;

  //=== END NSISTATEFULFRAME

  //==== OVERLOAD of nsIFrame

  void ElementStateChanged(mozilla::dom::ElementState aStates) override;

  nsresult PeekOffset(mozilla::PeekOffsetStruct* aPos) override;

  NS_DECL_QUERYFRAME

 protected:
  MOZ_CAN_RUN_SCRIPT_BOUNDARY void HandleReadonlyOrDisabledChange();

  /**
   * Launch the reflow on the child frames - see nsTextControlFrame::Reflow()
   */
  void ReflowTextControlChild(nsIFrame* aKid, nsPresContext* aPresContext,
                              const ReflowInput& aReflowInput,
                              nsReflowStatus& aStatus,
                              ReflowOutput& aParentDesiredSize,
                              const mozilla::LogicalSize& aParentContentBoxSize,
                              nscoord& aButtonBoxISize);

 public:
  static Maybe<nscoord> ComputeBaseline(const nsIFrame*, const ReflowInput&,
                                        bool aForSingleLineControl);

  Element* GetRootNode() const { return ControlElement()->GetTextEditorRoot(); }

  Element* GetPreviewNode() const {
    return ControlElement()->GetTextEditorPreview();
  }

  Element* GetPlaceholderNode() const {
    return ControlElement()->GetTextEditorPlaceholder();
  }

  Element* GetButton() const { return ControlElement()->GetTextEditorButton(); }

  bool IsButtonBox(const nsIFrame* aFrame) const {
    return mozilla::TextControlElement::IsButtonPseudoElement(
        aFrame->Style()->GetPseudoType());
  }

  // called by the focus listener
  nsresult MaybeBeginSecureKeyboardInput();
  void MaybeEndSecureKeyboardInput();

  mozilla::TextControlElement* ControlElement() const {
    MOZ_ASSERT(mozilla::TextControlElement::FromNode(GetContent()));
    return static_cast<mozilla::TextControlElement*>(GetContent());
  }

#define DEFINE_TEXTCTRL_CONST_FORWARDER(type, name) \
  type name() const { return ControlElement()->name(); }

  DEFINE_TEXTCTRL_CONST_FORWARDER(bool, IsSingleLineTextControl)
  DEFINE_TEXTCTRL_CONST_FORWARDER(bool, IsTextArea)
  DEFINE_TEXTCTRL_CONST_FORWARDER(bool, IsPasswordTextControl)
  DEFINE_TEXTCTRL_CONST_FORWARDER(Maybe<int32_t>, GetCols)
  DEFINE_TEXTCTRL_CONST_FORWARDER(int32_t, GetColsOrDefault)
  DEFINE_TEXTCTRL_CONST_FORWARDER(int32_t, GetRows)

#undef DEFINE_TEXTCTRL_CONST_FORWARDER

 protected:
  // Compute our intrinsic size.  This does not include any borders, paddings,
  // etc.  Just the size of our actual area for the text (and the scrollbars,
  // for <textarea>).
  mozilla::LogicalSize CalcIntrinsicSize(gfxContext* aRenderingContext,
                                         mozilla::WritingMode aWM) const;

  void Init(nsIContent* aContent, nsContainerFrame* aParent,
            nsIFrame* aPrevInFlow) override;

  // Our first baseline, or NS_INTRINSIC_ISIZE_UNKNOWN if we have a pending
  // Reflow (or if we're contain:layout, which means we have no baseline).
  nscoord mFirstBaseline = NS_INTRINSIC_ISIZE_UNKNOWN;

  // these packed bools could instead use the high order bits on mState, saving
  // 4 bytes
  bool mIsProcessing = false;
};

#endif
