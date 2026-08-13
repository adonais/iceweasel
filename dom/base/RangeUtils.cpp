/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RangeUtils.h"

#include "mozilla/Assertions.h"
#include "mozilla/dom/AbstractRange.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/HTMLSlotElement.h"
#include "mozilla/dom/ShadowRoot.h"
#include "nsContentUtils.h"
#include "nsFrameSelection.h"
#include "nsIContentInlines.h"

namespace mozilla {

using namespace dom;

template bool RangeUtils::IsValidPoints(const RangeBoundary&,
                                        const RangeBoundary&);
template bool RangeUtils::IsValidPoints(const RangeBoundary&,
                                        const RawRangeBoundary&);
template bool RangeUtils::IsValidPoints(const RawRangeBoundary&,
                                        const RangeBoundary&);
template bool RangeUtils::IsValidPoints(const RawRangeBoundary&,
                                        const RawRangeBoundary&);

template nsresult
RangeUtils::CompareNodeToRangeBoundaries<TreeKind::ShadowIncludingDOM>(
    const nsINode*, const RangeBoundary&, const RangeBoundary&, bool*, bool*);
template nsresult
RangeUtils::CompareNodeToRangeBoundaries<TreeKind::FlatForSelection>(
    const nsINode*, const RangeBoundary&, const RangeBoundary&, bool*, bool*);

template nsresult RangeUtils::CompareNodeToRangeBoundaries<
    TreeKind::ShadowIncludingDOM>(const nsINode*, const RangeBoundary&,
                                  const RawRangeBoundary&, bool*, bool*);
template nsresult RangeUtils::CompareNodeToRangeBoundaries<
    TreeKind::FlatForSelection>(const nsINode*, const RangeBoundary&,
                                const RawRangeBoundary&, bool*, bool*);

template nsresult RangeUtils::CompareNodeToRangeBoundaries<
    TreeKind::ShadowIncludingDOM>(const nsINode*, const RawRangeBoundary&,
                                  const RangeBoundary&, bool*, bool*);
template nsresult RangeUtils::CompareNodeToRangeBoundaries<
    TreeKind::FlatForSelection>(const nsINode*, const RawRangeBoundary&,
                                const RangeBoundary&, bool*, bool*);

template nsresult RangeUtils::CompareNodeToRangeBoundaries<
    TreeKind::ShadowIncludingDOM>(const nsINode*, const RawRangeBoundary&,
                                  const RawRangeBoundary&, bool*, bool*);
template nsresult RangeUtils::CompareNodeToRangeBoundaries<
    TreeKind::FlatForSelection>(const nsINode*, const RawRangeBoundary&,
                                const RawRangeBoundary&, bool*, bool*);

template nsresult RangeUtils::CompareNodeToRange<TreeKind::ShadowIncludingDOM>(
    const nsINode*, const AbstractRange*, bool*, bool*);
template nsresult RangeUtils::CompareNodeToRange<TreeKind::FlatForSelection>(
    const nsINode*, const AbstractRange*, bool*, bool*);

template Maybe<bool> RangeUtils::IsNodeContainedInRange<
    TreeKind::ShadowIncludingDOM>(const nsINode&, const AbstractRange*);
template Maybe<bool> RangeUtils::IsNodeContainedInRange<
    TreeKind::FlatForSelection>(const nsINode&, const AbstractRange*);

[[nodiscard]] static inline bool ParentNodeIsInSameSelection(
    const nsINode& aNode) {
  // Currently, independent selection root is always the anonymous <div> in a
  // text control which is an native anonymous subtree root.  Therefore, we
  // can skip most checks if the node is not a root of native anonymous subtree.
  if (!aNode.IsRootOfNativeAnonymousSubtree()) {
    return true;
  }
  // If the node returns nullptr for frame selection, it means that it's not the
  // anonymous <div> of the editable content root of a text control or just not
  // in composed doc.
  const nsFrameSelection* frameSelection = aNode.GetFrameSelection();
  if (!frameSelection || frameSelection->IsIndependentSelection()) {
    MOZ_ASSERT_IF(aNode.GetClosestNativeAnonymousSubtreeRootParentOrHost(),
                  aNode.GetClosestNativeAnonymousSubtreeRootParentOrHost()
                      ->IsTextControlElement());
    return false;
  }
  return true;
}

// static
nsINode* RangeUtils::ComputeRootNode(nsINode* aNode) {
  if (!aNode) {
    return nullptr;
  }

  if (aNode->IsContent()) {
    if (aNode->NodeInfo()->NameAtom() == nsGkAtoms::documentTypeNodeName) {
      return nullptr;
    }

    nsIContent* content = aNode->AsContent();

    // If the node is in a shadow tree then the ShadowRoot is the root.
    //
    // FIXME(emilio): Should this be after the NAC check below? We can have NAC
    // inside Shadow DOM which will peek this path rather than the one below.
    if (ShadowRoot* containingShadow = content->GetContainingShadow()) {
      return containingShadow;
    }

    // If the node is in NAC, then the NAC parent should be the root.
    if (nsINode* root =
            content->GetClosestNativeAnonymousSubtreeRootParentOrHost()) {
      return root;
    }
  }

  // Elements etc. must be in document or in document fragment,
  // text nodes in document, in document fragment or in attribute.
  if (nsINode* root = aNode->GetUncomposedDoc()) {
    return root;
  }

  NS_ASSERTION(!aNode->SubtreeRoot()->IsDocument(),
               "GetUncomposedDoc should have returned a doc");

  // We allow this because of backward compatibility.
  return aNode->SubtreeRoot();
}

// static
template <typename SPT, typename SRT, typename EPT, typename ERT>
bool RangeUtils::IsValidPoints(
    const RangeBoundaryBase<SPT, SRT>& aStartBoundary,
    const RangeBoundaryBase<EPT, ERT>& aEndBoundary) {
  // Use NS_WARN_IF() only for the cases where the arguments are unexpected.
  if (NS_WARN_IF(!aStartBoundary.IsSetAndValid()) ||
      NS_WARN_IF(!aEndBoundary.IsSetAndValid())) {
    return false;
  }

  MOZ_ASSERT(aStartBoundary.GetTreeKind() == aEndBoundary.GetTreeKind());

  // Otherwise, don't use NS_WARN_IF() for preventing to make console messy.
  // Instead, check one by one since it is easier to catch the error reason
  // with debugger.

  if (ComputeRootNode(aStartBoundary.GetContainer()) !=
      ComputeRootNode(aEndBoundary.GetContainer())) {
    return false;
  }

  const Maybe<int32_t> order =
      aStartBoundary.GetTreeKind() == TreeKind::FlatForSelection
          ? nsContentUtils::ComparePoints<TreeKind::FlatForSelection>(
                aStartBoundary, aEndBoundary)
          : nsContentUtils::ComparePoints<TreeKind::DOM>(aStartBoundary,
                                                         aEndBoundary);
  if (!order) {
    MOZ_ASSERT_UNREACHABLE();
    return false;
  }

  return *order != 1;
}

// static
template <TreeKind aKind, typename Dummy>
Maybe<bool> RangeUtils::IsNodeContainedInRange(
    const nsINode& aNode, const AbstractRange* aAbstractRange) {
  bool nodeIsBeforeRange{false};
  bool nodeIsAfterRange{false};

  const nsresult rv = CompareNodeToRange<aKind>(
      &aNode, aAbstractRange, &nodeIsBeforeRange, &nodeIsAfterRange);
  if (NS_FAILED(rv)) {
    return Nothing();
  }

  return Some(!nodeIsBeforeRange && !nodeIsAfterRange);
}

// Utility routine to detect if a content node is completely contained in a
// range If outNodeBefore is returned true, then the node starts before the
// range does. If outNodeAfter is returned true, then the node ends after the
// range does. Note that both of the above might be true. If neither are true,
// the node is contained inside of the range.
// XXX - callers responsibility to ensure node in same doc as range!

// static
template <TreeKind aKind, typename Dummy>
nsresult RangeUtils::CompareNodeToRange(const nsINode* aNode,
                                        const AbstractRange* aAbstractRange,
                                        bool* aNodeIsBeforeRange,
                                        bool* aNodeIsAfterRange) {
  if (NS_WARN_IF(!aAbstractRange) ||
      NS_WARN_IF(!aAbstractRange->IsPositioned())) {
    return NS_ERROR_INVALID_ARG;
  }
  return CompareNodeToRangeBoundaries<aKind>(
      aNode, aAbstractRange->MayCrossShadowBoundaryStartRef(),
      aAbstractRange->MayCrossShadowBoundaryEndRef(), aNodeIsBeforeRange,
      aNodeIsAfterRange);
}

template <TreeKind aKind, typename SPT, typename SRT, typename EPT,
          typename ERT, typename Dummy>
nsresult RangeUtils::CompareNodeToRangeBoundaries(
    const nsINode* aNode, const RangeBoundaryBase<SPT, SRT>& aStartBoundary,
    const RangeBoundaryBase<EPT, ERT>& aEndBoundary, bool* aNodeIsBeforeRange,
    bool* aNodeIsAfterRange) {
  MOZ_ASSERT(aNodeIsBeforeRange);
  MOZ_ASSERT(aNodeIsAfterRange);
  MOZ_ASSERT(aStartBoundary.GetTreeKind() == aEndBoundary.GetTreeKind());

  if (NS_WARN_IF(!aNode) ||
      NS_WARN_IF(!aStartBoundary.IsSet() || !aEndBoundary.IsSet())) {
    return NS_ERROR_INVALID_ARG;
  }

  constexpr TreeKind boundaryKind = aKind == TreeKind::FlatForSelection
                                        ? TreeKind::FlatForSelection
                                        : TreeKind::DOM;

  // create a pair of dom points that expresses location of node:
  //     NODE(start), NODE(end)
  // Let incoming range be:
  //    {RANGE(start), RANGE(end)}
  // if (RANGE(start) <= NODE(start))  and (RANGE(end) => NODE(end))
  // then the Node is contained (completely) by the Range.

  // gather up the dom point info
  ConstRawRangeBoundary nodeStart(boundaryKind);
  ConstRawRangeBoundary nodeEnd(boundaryKind);

  // ShadowRoot has no parent, nor can be represented by parent/offset pair.
  nsINode* const parentNodeInSameSelection = [&]() -> nsINode* {
    if (aNode->IsShadowRoot()) {
      return nullptr;
    }
    return ShadowDOMSelectionHelpers::GetParentNodeInSameSelection(
        *aNode, aKind == TreeKind::FlatForSelection
                    ? AllowRangeCrossShadowBoundary::Yes
                    : AllowRangeCrossShadowBoundary::No);
  }();

  if (!parentNodeInSameSelection) {
    // can't make a parent/offset pair to represent start or
    // end of the root node, because it has no parent.
    // so instead represent it by (node,0) and (node,numChildren)
    nodeStart = ConstRawRangeBoundary::StartOfParent(
        *aNode, RangeBoundarySetBy::Ref, boundaryKind);
    nodeEnd = ConstRawRangeBoundary::EndOfParent(
        *aNode, RangeBoundarySetBy::Ref, boundaryKind);
  } else if (const auto* slotAsParent =
                 parentNodeInSameSelection
                     ->GetAsHTMLSlotElementIfFilledForSelection();
             slotAsParent && aKind == TreeKind::FlatForSelection) {
    // aNode is a slotted content, use the index in the assigned nodes
    // to represent this node.
    auto index = slotAsParent->AssignedNodes().IndexOf(aNode);
    nodeStart =
        ConstRawRangeBoundary(slotAsParent, index, RangeBoundarySetBy::Offset,
                              TreeKind::FlatForSelection);
    nodeEnd = ConstRawRangeBoundary(slotAsParent, index + 1,
                                    RangeBoundarySetBy::Offset,
                                    TreeKind::FlatForSelection);
  } else {
    nodeStart =
        ConstRawRangeBoundary::FromChild(*aNode->AsContent(), boundaryKind);
    nodeEnd = ConstRawRangeBoundary::After(*aNode->AsContent(), boundaryKind);
    if (boundaryKind == TreeKind::FlatForSelection && !nodeStart.IsSet() &&
        !nodeEnd.IsSet()) {
      if (ShadowRoot* const shadowRoot =
              parentNodeInSameSelection->GetShadowRootForSelection()) {
        // In this case, aNode must be a child node which is not in the shadow
        // hosted by the parent node.
        if (aNode == parentNodeInSameSelection->GetFirstChild()) {
          nodeStart = nodeEnd = ConstRawRangeBoundary::StartOfParent(
              *shadowRoot, RangeBoundarySetBy::Ref, TreeKind::FlatForSelection);
        } else {
          nodeStart = nodeEnd = ConstRawRangeBoundary::EndOfParent(
              *shadowRoot, RangeBoundarySetBy::Ref, TreeKind::FlatForSelection);
        }
      }
    }
  }

  // XXX nsContentUtils::ComparePoints() may be expensive.  If some callers
  //     just want one of aNodeIsBeforeRange or aNodeIsAfterRange, we can
  //     skip the other comparison.

  // In the ComparePoints calls below we use a container & offset instead of
  // a range boundary because the range boundary constructor warns if you pass
  // in a -1 offset and the ComputeIndexOf call above can return -1 if aNode
  // is native anonymous content. ComparePoints has comments about offsets
  // being -1 and it seems to deal with it, or at least we aren't aware of any
  // problems arising because of it. We don't have a better idea how to get
  // rid of the warning without much larger changes so we do this just to
  // silence the warning. (Bug 1438996)

  const ConstRawRangeBoundary startBoundary =
      aStartBoundary.GetTreeKind() == boundaryKind
          ? aStartBoundary.AsConstRaw()
          : (boundaryKind == TreeKind::DOM
                 ? aStartBoundary.AsConstRaw().AsRangeBoundaryInDOMTree()
                 : aStartBoundary.AsConstRaw()
                       .AsRangeBoundaryInFlatTreeOrNonFlattenedNode(
                           aStartBoundary == aEndBoundary
                               ? RangeBoundaryFor::Collapsed
                               : RangeBoundaryFor::Start));
  // is RANGE(start) <= NODE(start) ?
  Maybe<int32_t> order =
      nsContentUtils::ComparePoints<aKind>(startBoundary, nodeStart);
  if (NS_WARN_IF(!order)) {
    return NS_ERROR_DOM_WRONG_DOCUMENT_ERR;
  }
  *aNodeIsBeforeRange = *order > 0;

  const ConstRawRangeBoundary endBoundary =
      aEndBoundary.GetTreeKind() == boundaryKind
          ? aEndBoundary.AsConstRaw()
          : (boundaryKind == TreeKind::DOM
                 ? aEndBoundary.AsConstRaw().AsRangeBoundaryInDOMTree()
                 : aEndBoundary.AsConstRaw()
                       .AsRangeBoundaryInFlatTreeOrNonFlattenedNode(
                           aStartBoundary == aEndBoundary
                               ? RangeBoundaryFor::Collapsed
                               : RangeBoundaryFor::End));
  // is RANGE(end) >= NODE(end) ?
  order = nsContentUtils::ComparePoints<aKind>(endBoundary, nodeEnd);
  if (NS_WARN_IF(!order)) {
    return NS_ERROR_DOM_WRONG_DOCUMENT_ERR;
  }
  *aNodeIsAfterRange = *order < 0;

  return NS_OK;
}

// static
RawRangeBoundary ShadowDOMSelectionHelpers::StartRef(
    const AbstractRange* aRange,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  MOZ_ASSERT(aRange);
  return (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes)
             ? aRange->MayCrossShadowBoundaryStartRef().AsRaw()
             : aRange->StartRef().AsRaw();
}

// static
nsINode* ShadowDOMSelectionHelpers::GetStartContainer(
    const AbstractRange* aRange,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  MOZ_ASSERT(aRange);
  return (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes)
             ? aRange->GetMayCrossShadowBoundaryStartContainer()
             : aRange->GetStartContainer();
}

// static
uint32_t ShadowDOMSelectionHelpers::StartOffset(
    const AbstractRange* aRange,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  MOZ_ASSERT(aRange);
  return (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes)
             ? aRange->MayCrossShadowBoundaryStartOffset()
             : aRange->StartOffset();
}

// static
RawRangeBoundary ShadowDOMSelectionHelpers::EndRef(
    const AbstractRange* aRange,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  MOZ_ASSERT(aRange);
  return (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes)
             ? aRange->MayCrossShadowBoundaryEndRef().AsRaw()
             : aRange->EndRef().AsRaw();
}

// static
nsINode* ShadowDOMSelectionHelpers::GetEndContainer(
    const AbstractRange* aRange,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  MOZ_ASSERT(aRange);
  return (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes)
             ? aRange->GetMayCrossShadowBoundaryEndContainer()
             : aRange->GetEndContainer();
}

// static
uint32_t ShadowDOMSelectionHelpers::EndOffset(
    const AbstractRange* aRange,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  MOZ_ASSERT(aRange);
  return (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes)
             ? aRange->MayCrossShadowBoundaryEndOffset()
             : aRange->EndOffset();
}

// static
nsINode* ShadowDOMSelectionHelpers::GetParentNodeInSameSelection(
    const nsINode& aNode,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  if (!ParentNodeIsInSameSelection(aNode)) {
    return nullptr;
  }

  if (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes) {
    if (aNode.IsContent()) {
      if (HTMLSlotElement* const slot =
              aNode.AsContent()->GetAssignedSlotForSelection()) {
        return slot;
      }
    }
    return aNode.GetParentOrShadowHostNode();
  }
  return aNode.GetParentNode();
}

// static
ShadowRoot* ShadowDOMSelectionHelpers::GetShadowRoot(
    const nsINode* aNode,
    AllowRangeCrossShadowBoundary aAllowCrossShadowBoundary) {
  MOZ_ASSERT(aNode);
  return (aAllowCrossShadowBoundary == AllowRangeCrossShadowBoundary::Yes)
             ? aNode->GetShadowRootForSelection()
             : nullptr;
}  // namespace dom

}  // namespace mozilla
