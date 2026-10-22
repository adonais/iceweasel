/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIContent.h"

#include "ChildIterator.h"
#include "NodeUbiReporting.h"
#include "mozilla/EventDispatcher.h"
#include "mozilla/HTMLEditor.h"
#include "mozilla/MouseEvents.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/TouchEvents.h"
#include "mozilla/URLExtraData.h"
#include "mozilla/dom/AncestorIterator.h"
#include "mozilla/dom/DOMArena.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/DocumentInlines.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/HTMLBodyElement.h"
#include "mozilla/dom/HTMLHeadingElement.h"
#include "mozilla/dom/HTMLSlotElement.h"
#include "mozilla/dom/NodeInfo.h"
#include "mozilla/dom/SVGUseElement.h"
#include "mozilla/dom/ShadowRoot.h"
#include "mozilla/dom/Touch.h"
#include "mozilla/dom/TreeIterator.h"
#include "mozilla/dom/UnbindContext.h"
#include "mozilla/mozInlineSpellChecker.h"
#include "mozilla/widget/IMEData.h"
#include "nsContentUtils.h"
#include "nsCycleCollectionParticipant.h"
#include "nsNodeInfoManager.h"
#include "nsNodeSupportsWeakRefTearoff.h"
#include "nsWrapperCache.h"

using namespace mozilla;
using namespace mozilla::dom;

NS_IMPL_CYCLE_COLLECTION_CLASS(nsIContent)

NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN(nsIContent)
  MOZ_ASSERT_UNREACHABLE("Our subclasses don't call us");
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN(nsIContent)
  MOZ_ASSERT_UNREACHABLE("Our subclasses don't call us");
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

NS_INTERFACE_MAP_BEGIN(nsIContent)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  // Don't bother to QI to cycle collection, because our CC impl is
  // not doing anything anyway.
  NS_INTERFACE_MAP_ENTRY(nsIContent)
  NS_INTERFACE_MAP_ENTRY(nsINode)
  NS_INTERFACE_MAP_ENTRY(EventTarget)
  NS_INTERFACE_MAP_ENTRY_TEAROFF(nsISupportsWeakReference,
                                 new nsNodeSupportsWeakRefTearoff(this))
  // DOM bindings depend on the identity pointer being the
  // same as nsINode (which nsIContent inherits).
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(nsIContent)

NS_IMPL_DOMARENA_DESTROY(nsIContent)

NS_IMPL_CYCLE_COLLECTING_RELEASE_WITH_LAST_RELEASE_AND_DESTROY(nsIContent,
                                                               LastRelease(),
                                                               Destroy())

nsIContent* nsIContent::FindFirstNonChromeOnlyAccessContent() const {
  // This handles also nested native anonymous content.
  // Oops, this function signature allows casting const to non-const.  (Then
  // again, so does GetFirstChild()->GetParent().)
  for (nsIContent* content = const_cast<nsIContent*>(this); content;
       content = content->GetClosestNativeAnonymousSubtreeRootParentOrHost()) {
    if (!content->ChromeOnlyAccess()) {
      return content;
    }
  }
  return nullptr;
}

void nsIContent::UnbindFromTree(nsINode* aNewParent,
                                const BatchRemovalState* aBatchState) {
  UnbindContext context(*this, aBatchState);
  context.SetIsMove(aNewParent != nullptr);
  UnbindFromTree(context);
}

HTMLSlotElement* nsIContent::GetAssignedSlotForSelection() const {
  HTMLSlotElement* const assignedSlot = GetAssignedSlot();
  if (!assignedSlot) {
    return nullptr;
  }
  ShadowRoot* const containingShadowRoot = assignedSlot->GetContainingShadow();
  return containingShadowRoot && !containingShadowRoot->IsUAWidget()
             ? assignedSlot
             : nullptr;
}

// https://dom.spec.whatwg.org/#dom-slotable-assignedslot
HTMLSlotElement* nsIContent::GetAssignedSlotByMode() const {
  /**
   * Get slotable's assigned slot for the result of
   * find a slot with open flag UNSET [1].
   *
   * [1] https://dom.spec.whatwg.org/#assign-a-slot
   */
  HTMLSlotElement* slot = GetAssignedSlot();
  if (!slot) {
    return nullptr;
  }

  MOZ_ASSERT(GetParent());
  MOZ_ASSERT(GetParent()->GetShadowRoot());

  /**
   * Additional check for open flag SET:
   *   If slotable’s parent’s shadow root's mode is not "open",
   *   then return null.
   */
  if (GetParent()->GetShadowRoot()->IsClosed()) {
    return nullptr;
  }

  return slot;
}

nsIContent::IMEState nsIContent::GetDesiredIMEState() {
  if (!IsEditable() || !IsInComposedDoc()) {
    // Check for the special case where we're dealing with elements which don't
    // have the editable flag set, but are readwrite (such as text controls).
    if (!IsElement() ||
        !AsElement()->State().HasState(ElementState::READWRITE)) {
      return IMEState(IMEEnabled::Disabled);
    }
  }
  // NOTE: The content for independent editors (e.g., input[type=text],
  // textarea) must override this method, so, we don't need to worry about
  // that here.
  nsIContent* editableAncestor = GetEditingHost();

  // This is in another editable content, use the result of it.
  if (editableAncestor && editableAncestor != this) {
    return editableAncestor->GetDesiredIMEState();
  }
  Document* doc = GetComposedDoc();
  if (!doc) {
    return IMEState(IMEEnabled::Disabled);
  }
  nsPresContext* pc = doc->GetPresContext();
  if (!pc) {
    return IMEState(IMEEnabled::Disabled);
  }
  HTMLEditor* htmlEditor = nsContentUtils::GetHTMLEditor(pc);
  if (!htmlEditor) {
    return IMEState(IMEEnabled::Disabled);
  }
  // FYI: HTMLEditor::GetPreferredIMEState() is infallible.
  return htmlEditor->GetPreferredIMEState().unwrap();
}

bool nsIContent::HasIndependentSelection() const {
  nsIFrame* frame = GetPrimaryFrame();
  return frame && frame->IsInsideTextControl();
}

Element* nsIContent::GetEditingHost() const {
  // If this isn't editable, return nullptr.
  if (!IsEditable()) {
    return nullptr;
  }

  Document* doc = GetComposedDoc();
  if (!doc) {
    return nullptr;
  }

  Element* editableParentElement = nullptr;
  for (Element* parent = GetParentElement();
       parent && parent->HasFlag(NODE_IS_EDITABLE);
       parent = editableParentElement->GetParentElement()) {
    editableParentElement = parent;
  }
  // If this is in designMode, and we have reached the root <html> element (i.e.
  // no contenteditable=false along the way), we should return the <body>
  // instead. Otherwise, we return the outermost editable element.
  if (IsInDesignMode() && editableParentElement &&
      editableParentElement->IsHTMLElement(nsGkAtoms::html) &&
      !IsInShadowTree()) {
    // FIXME: There may be no <body> or it may not be editable.
    // In such cases we should use root element instead.
    auto* body = doc->GetBodyElement();
    // return null if body has contenteditable=false
    return body && body->IsEditable() ? body : nullptr;
  }
  return editableParentElement
             ? editableParentElement
             : Element::FromNode(const_cast<nsIContent*>(this));
}

nsresult nsIContent::LookupNamespaceURIInternal(
    const nsAString& aNamespacePrefix, nsAString& aNamespaceURI) const {
  if (aNamespacePrefix.EqualsLiteral("xml")) {
    // Special-case for xml prefix
    aNamespaceURI.AssignLiteral("http://www.w3.org/XML/1998/namespace");
    return NS_OK;
  }

  if (aNamespacePrefix.EqualsLiteral("xmlns")) {
    // Special-case for xmlns prefix
    aNamespaceURI.AssignLiteral("http://www.w3.org/2000/xmlns/");
    return NS_OK;
  }

  RefPtr<nsAtom> name;
  if (!aNamespacePrefix.IsEmpty()) {
    name = NS_Atomize(aNamespacePrefix);
    NS_ENSURE_TRUE(name, NS_ERROR_OUT_OF_MEMORY);
  } else {
    name = nsGkAtoms::xmlns;
  }
  // Trace up the content parent chain looking for the namespace
  // declaration that declares aNamespacePrefix.
  for (Element* element = GetAsElementOrParentElement(); element;
       element = element->GetParentElement()) {
    if (element->GetAttr(kNameSpaceID_XMLNS, name, aNamespaceURI)) {
      return NS_OK;
    }
  }
  return NS_ERROR_FAILURE;
}

nsIContent* nsIContent::GetInclusiveEditableAncestor() const {
  if (IsEditable()) {
    return const_cast<nsIContent*>(this);
  }
  for (auto* const content : AncestorsOfType<nsIContent>()) {
    if (content->IsEditable()) {
      return content;
    }
  }
  return nullptr;
}

nsAtom* nsIContent::GetLang() const {
  for (const Element* element = GetAsElementOrParentElement(); element;
       element = element->GetParentElement()) {
    if (!element->GetAttrCount()) {
      continue;
    }

    // xml:lang has precedence over lang on HTML elements (see
    // XHTML1 section C.7).
    const nsAttrValue* attr =
        element->GetParsedAttr(nsGkAtoms::lang, kNameSpaceID_XML);
    if (!attr && element->SupportsLangAttr()) {
      attr = element->GetParsedAttr(nsGkAtoms::lang);
    }
    if (attr) {
      MOZ_ASSERT(attr->Type() == nsAttrValue::eAtom);
      MOZ_ASSERT(attr->GetAtomValue());
      return attr->GetAtomValue();
    }
  }

  return nullptr;
}

nsIURI* nsIContent::GetBaseURI(bool aTryUseXHRDocBaseURI) const {
  if (SVGUseElement* use = GetContainingSVGUseShadowHost()) {
    if (URLExtraData* data = use->GetContentURLData()) {
      return data->BaseURI();
    }
  }

  return OwnerDoc()->GetBaseURI(aTryUseXHRDocBaseURI);
}

nsIURI* nsIContent::GetBaseURIForStyleAttr() const {
  if (SVGUseElement* use = GetContainingSVGUseShadowHost()) {
    if (URLExtraData* data = use->GetContentURLData()) {
      return data->BaseURI();
    }
  }
  // This also ignores the case that SVG inside XBL binding.
  // But it is probably fine.
  return OwnerDoc()->GetDocBaseURI();
}

already_AddRefed<URLExtraData> nsIContent::GetURLDataForStyleAttr(
    nsIPrincipal* aSubjectPrincipal) const {
  if (SVGUseElement* use = GetContainingSVGUseShadowHost()) {
    if (URLExtraData* data = use->GetContentURLData()) {
      return do_AddRef(data);
    }
  }
  auto* doc = OwnerDoc();
  if (aSubjectPrincipal && aSubjectPrincipal != NodePrincipal()) {
    nsCOMPtr<nsIReferrerInfo> referrerInfo =
        doc->ReferrerInfoForInternalCSSAndSVGResources();
    // TODO: Cache this?
    return MakeAndAddRef<URLExtraData>(doc->GetDocBaseURI(), referrerInfo,
                                       aSubjectPrincipal);
  }
  return do_AddRef(doc->DefaultStyleAttrURLData());
}

void nsIContent::UpdateHeadingElementsOffsetChange() {
  TreeIterator<FlattenedChildIterator> iter(*this);
  for (; iter.GetCurrent(); iter.GetNext()) {
    if (auto* heading = HTMLHeadingElement::FromNode(iter.GetCurrent())) {
      heading->UpdateLevel(true);
    }
  }
}

void nsIContent::ConstructUbiNode(void* storage) {
  JS::ubi::Concrete<nsIContent>::construct(storage, this);
}

bool nsIContent::InclusiveDescendantMayNeedSpellchecking(HTMLEditor* aEditor) {
  // Return true if the node may have elements as children, since those or their
  // descendants may have spellcheck attributes.
  return HasFlag(NODE_MAY_HAVE_ELEMENT_CHILDREN) ||
         mozInlineSpellChecker::ShouldSpellCheckNode(aEditor, this);
}

void nsIContent::nsExtendedContentSlots::UnlinkExtendedSlots(nsIContent&) {
  mAssignedSlot = nullptr;
}

void nsIContent::nsExtendedContentSlots::TraverseExtendedSlots(
    nsCycleCollectionTraversalCallback& aCb) {
  NS_CYCLE_COLLECTION_NOTE_EDGE_NAME(aCb, "mExtendedSlots->mAssignedSlot");
  aCb.NoteXPCOMChild(NS_ISUPPORTS_CAST(nsIContent*, mAssignedSlot.get()));
}

nsIContent::nsExtendedContentSlots::nsExtendedContentSlots() = default;

nsIContent::nsContentSlots* nsIContent::CreateSlots() {
  void* mem = AllocateSlots(sizeof(nsContentSlots));
  return new (mem) nsContentSlots();
}

nsIContent::nsExtendedContentSlots* nsIContent::CreateExtendedSlots() {
  void* mem = AllocateSlots(sizeof(nsExtendedContentSlots));
  return new (mem) nsExtendedContentSlots();
}

nsIContent::nsExtendedContentSlots::~nsExtendedContentSlots() {
  MOZ_ASSERT(!mManualSlotAssignment);
}

size_t nsIContent::nsExtendedContentSlots::SizeOfExcludingThis(
    MallocSizeOf aMallocSizeOf) const {
  // For now, nothing to measure here.  We don't actually own any of our
  // members.
  return 0;
}

static nsINode* FindChromeAccessOnlySubtreeOwnerForEvents(nsINode* aNode) {
  if (!aNode->ChromeOnlyAccessForEvents()) {
    return aNode;
  }
  return aNode->GetClosestNativeAnonymousSubtreeRootParentOrHost();
}

static nsINode* FindChromeAccessOnlySubtreeOwnerForEvents(
    EventTarget* aTarget) {
  nsINode* node = nsINode::FromEventTargetOrNull(aTarget);
  if (!node) {
    return nullptr;
  }
  return FindChromeAccessOnlySubtreeOwnerForEvents(node);
}

void nsIContent::GetEventTargetParent(EventChainPreVisitor& aVisitor) {
  // FIXME! Document how this event retargeting works, Bug 329124.
  aVisitor.mCanHandle = true;
  aVisitor.mMayHaveListenerManager = HasListenerManager();

  if (IsInShadowTree()) {
    aVisitor.mItemInShadowTree = true;
  }

  // Don't propagate mouseover and mouseout events when mouse is moving
  // inside chrome access only content.
  const bool isAnonForEvents = IsRootOfChromeAccessOnlySubtree();
  aVisitor.mRootOfClosedTree = isAnonForEvents;
  if ((aVisitor.mEvent->mMessage == eMouseOver ||
       aVisitor.mEvent->mMessage == eMouseOut ||
       aVisitor.mEvent->mMessage == ePointerOver ||
       aVisitor.mEvent->mMessage == ePointerOut) &&
      // Check if we should stop event propagation when event has just been
      // dispatched or when we're about to propagate from
      // chrome access only subtree or if we are about to propagate out of
      // a shadow root to a shadow root host.
      ((this == aVisitor.mEvent->mOriginalTarget && !ChromeOnlyAccess()) ||
       isAnonForEvents)) {
    nsIContent* relatedTarget = nsIContent::FromEventTargetOrNull(
        aVisitor.mEvent->AsMouseEvent()->mRelatedTarget);
    if (relatedTarget && relatedTarget->OwnerDoc() == OwnerDoc()) {
      // If current target is anonymous for events or we know that related
      // target is descendant of an element which is anonymous for events,
      // we may want to stop event propagation.
      // If this is the original target, aVisitor.mRelatedTargetIsInAnon
      // must be updated.
      if (isAnonForEvents || aVisitor.mRelatedTargetIsInAnon ||
          (aVisitor.mEvent->mOriginalTarget == this &&
           (aVisitor.mRelatedTargetIsInAnon =
                relatedTarget->ChromeOnlyAccessForEvents()))) {
        nsINode* anonOwner = FindChromeAccessOnlySubtreeOwnerForEvents(this);
        if (anonOwner) {
          nsINode* anonOwnerRelated =
              FindChromeAccessOnlySubtreeOwnerForEvents(relatedTarget);
          if (anonOwnerRelated) {
            // Note, anonOwnerRelated may still be inside some other
            // native anonymous subtree. The case where anonOwner is still
            // inside native anonymous subtree will be handled when event
            // propagates up in the DOM tree.
            while (anonOwner != anonOwnerRelated &&
                   anonOwnerRelated->ChromeOnlyAccessForEvents()) {
              anonOwnerRelated =
                  FindChromeAccessOnlySubtreeOwnerForEvents(anonOwnerRelated);
            }
            if (anonOwner == anonOwnerRelated) {
#ifdef DEBUG_smaug
              nsIContent* originalTarget = nsIContent::FromEventTargetOrNull(
                  aVisitor.mEvent->mOriginalTarget);
              nsAutoString ot, ct, rt;
              if (originalTarget) {
                originalTarget->NodeInfo()->NameAtom()->ToString(ot);
              }
              NodeInfo()->NameAtom()->ToString(ct);
              relatedTarget->NodeInfo()->NameAtom()->ToString(rt);
              printf(
                  "Stopping %s propagation:"
                  "\n\toriginalTarget=%s \n\tcurrentTarget=%s %s"
                  "\n\trelatedTarget=%s %s \n%s",
                  (aVisitor.mEvent->mMessage == eMouseOver) ? "mouseover"
                                                            : "mouseout",
                  NS_ConvertUTF16toUTF8(ot).get(),
                  NS_ConvertUTF16toUTF8(ct).get(),
                  isAnonForEvents
                      ? "(is native anonymous)"
                      : (ChromeOnlyAccess() ? "(is in native anonymous subtree)"
                                            : ""),
                  NS_ConvertUTF16toUTF8(rt).get(),
                  relatedTarget->ChromeOnlyAccess()
                      ? "(is in native anonymous subtree)"
                      : "",
                  (originalTarget &&
                   relatedTarget->FindFirstNonChromeOnlyAccessContent() ==
                       originalTarget->FindFirstNonChromeOnlyAccessContent())
                      ? ""
                      : "Wrong event propagation!?!\n");
#endif
              aVisitor.SetParentTarget(nullptr, false);
              // Event should not propagate to non-anon content.
              aVisitor.mCanHandle = isAnonForEvents;
              return;
            }
          }
        }
      }
    }
  }

  // Event parent is the assigned slot, if node is assigned, or node's parent
  // otherwise.
  HTMLSlotElement* slot = GetAssignedSlot();
  nsIContent* parent = slot ? slot : GetParent();

  // Event may need to be retargeted if this is the root of a native anonymous
  // content subtree.
  if (isAnonForEvents) {
    aVisitor.mEventTargetAtParent = parent;
  } else if (parent && aVisitor.mOriginalTargetIsInAnon) {
    nsIContent* content =
        nsIContent::FromEventTargetOrNull(aVisitor.mEvent->mTarget);
    if (content &&
        content->GetClosestNativeAnonymousSubtreeRootParentOrHost() == parent) {
      aVisitor.mEventTargetAtParent = parent;
    }
  }

  if (!aVisitor.mEvent->mFlags.mComposedInNativeAnonymousContent &&
      isAnonForEvents && OwnerDoc()->GetWindow()) {
    aVisitor.SetParentTarget(OwnerDoc()->GetWindow()->GetParentTarget(), true);
  } else if (parent) {
    aVisitor.SetParentTarget(parent, false);
    if (slot) {
      ShadowRoot* root = slot->GetContainingShadow();
      if (root && root->IsClosed()) {
        aVisitor.mParentIsSlotInClosedTree = true;
      }
    }
  } else {
    aVisitor.SetParentTarget(GetComposedDoc(), false);
  }

  if (!ChromeOnlyAccessForEvents() &&
      !aVisitor.mRelatedTargetRetargetedInCurrentScope) {
    // We don't support Shadow DOM in native anonymous content yet.
    aVisitor.mRelatedTargetRetargetedInCurrentScope = true;
    if (aVisitor.mEvent->mOriginalRelatedTarget) {
      // https://dom.spec.whatwg.org/#concept-event-dispatch
      // Step 3.
      // "Let relatedTarget be the result of retargeting event's relatedTarget
      //  against target if event's relatedTarget is non-null, and null
      //  otherwise."
      //
      // This is a bit complicated because the event might be from native
      // anonymous content, but we need to deal with non-native anonymous
      // content there.
      bool initialTarget = this == aVisitor.mEvent->mOriginalTarget;
      nsINode* originalTargetAsNode = nullptr;
      // Use of mOriginalTargetIsInAnon is an optimization here.
      if (!initialTarget && aVisitor.mOriginalTargetIsInAnon) {
        originalTargetAsNode = FindChromeAccessOnlySubtreeOwnerForEvents(
            aVisitor.mEvent->mOriginalTarget);
        initialTarget = originalTargetAsNode == this;
      }
      if (initialTarget) {
        nsINode* relatedTargetAsNode =
            FindChromeAccessOnlySubtreeOwnerForEvents(
                aVisitor.mEvent->mOriginalRelatedTarget);
        if (!originalTargetAsNode) {
          originalTargetAsNode =
              nsINode::FromEventTargetOrNull(aVisitor.mEvent->mOriginalTarget);
        }

        if (relatedTargetAsNode && originalTargetAsNode) {
          nsINode* retargetedRelatedTarget = nsContentUtils::Retarget(
              relatedTargetAsNode, originalTargetAsNode);
          if (originalTargetAsNode == retargetedRelatedTarget &&
              retargetedRelatedTarget != relatedTargetAsNode) {
            // Step 4.
            // "If target is relatedTarget and target is not event's
            //  relatedTarget, then return true."
            aVisitor.IgnoreCurrentTargetBecauseOfShadowDOMRetargeting();
            // Old code relies on mTarget to point to the first element which
            // was not added to the event target chain because of mCanHandle
            // being false, but in Shadow DOM case mTarget really should
            // point to a node in Shadow DOM.
            aVisitor.mEvent->mTarget = aVisitor.mTargetInKnownToBeHandledScope;
            return;
          }

          // Part of step 5. Retargeting target has happened already higher
          // up in this method.
          // "Append to an event path with event, target, targetOverride,
          //  relatedTarget, and false."
          aVisitor.mRetargetedRelatedTarget = retargetedRelatedTarget;
        }
      } else if (nsINode* relatedTargetAsNode =
                     FindChromeAccessOnlySubtreeOwnerForEvents(
                         aVisitor.mEvent->mOriginalRelatedTarget)) {
        // Step 11.3.
        // "Let relatedTarget be the result of retargeting event's
        // relatedTarget against parent if event's relatedTarget is non-null,
        // and null otherwise.".
        nsINode* retargetedRelatedTarget =
            nsContentUtils::Retarget(relatedTargetAsNode, this);
        nsINode* targetInKnownToBeHandledScope =
            FindChromeAccessOnlySubtreeOwnerForEvents(
                aVisitor.mTargetInKnownToBeHandledScope);
        // If aVisitor.mTargetInKnownToBeHandledScope wasn't nsINode,
        // targetInKnownToBeHandledScope will be null. This may happen when
        // dispatching event to Window object in a content page and
        // propagating the event to a chrome Element.
        if (targetInKnownToBeHandledScope &&
            IsShadowIncludingInclusiveDescendantOf(
                targetInKnownToBeHandledScope->SubtreeRoot())) {
          // Part of step 11.4.
          // "If target's root is a shadow-including inclusive ancestor of
          //  parent, then"
          // "...Append to an event path with event, parent, null,
          // relatedTarget, "   and slot-in-closed-tree."
          aVisitor.mRetargetedRelatedTarget = retargetedRelatedTarget;
        } else if (this == retargetedRelatedTarget) {
          // Step 11.5
          // "Otherwise, if parent and relatedTarget are identical, then set
          //  parent to null."
          aVisitor.IgnoreCurrentTargetBecauseOfShadowDOMRetargeting();
          // Old code relies on mTarget to point to the first element which
          // was not added to the event target chain because of mCanHandle
          // being false, but in Shadow DOM case mTarget really should
          // point to a node in Shadow DOM.
          aVisitor.mEvent->mTarget = aVisitor.mTargetInKnownToBeHandledScope;
          return;
        } else if (targetInKnownToBeHandledScope) {
          // Note, if targetInKnownToBeHandledScope is null,
          // mTargetInKnownToBeHandledScope could be Window object in content
          // page and we're in chrome document in the same process.

          // Step 11.6
          aVisitor.mRetargetedRelatedTarget = retargetedRelatedTarget;
        }
      }
    }

    if (aVisitor.mEvent->mClass == eTouchEventClass) {
      // Retarget touch objects.
      MOZ_ASSERT(!aVisitor.mRetargetedTouchTargets.isSome());
      aVisitor.mRetargetedTouchTargets.emplace();
      WidgetTouchEvent* touchEvent = aVisitor.mEvent->AsTouchEvent();
      WidgetTouchEvent::TouchArray& touches = touchEvent->mTouches;
      for (uint32_t i = 0; i < touches.Length(); ++i) {
        Touch* touch = touches[i];
        EventTarget* originalTarget = touch->mOriginalTarget;
        EventTarget* touchTarget = originalTarget;
        nsCOMPtr<nsINode> targetAsNode =
            nsINode::FromEventTargetOrNull(originalTarget);
        if (targetAsNode) {
          EventTarget* retargeted =
              nsContentUtils::Retarget(targetAsNode, this);
          if (retargeted) {
            touchTarget = retargeted;
          }
        }
        aVisitor.mRetargetedTouchTargets->AppendElement(touchTarget);
        touch->mTarget = touchTarget;
      }
      MOZ_ASSERT(aVisitor.mRetargetedTouchTargets->Length() ==
                 touches.Length());
    }
  }

  if (slot) {
    // Inform that we're about to exit the current scope.
    aVisitor.mRelatedTargetRetargetedInCurrentScope = false;
  }
}

Element* nsIContent::GetAutofocusDelegate(IsFocusableFlags aFlags) const {
  for (nsINode* node = GetFirstChild(); node; node = node->GetNextNode(this)) {
    auto* descendant = Element::FromNode(*node);
    if (!descendant || !descendant->GetBoolAttr(nsGkAtoms::autofocus)) {
      continue;
    }

    nsIFrame* frame = descendant->GetPrimaryFrame();
    if (frame && frame->IsFocusable(aFlags)) {
      return descendant;
    }
  }
  return nullptr;
}

bool nsIContent::CanStartSelectionAsWebCompatHack() const {
  if (!StaticPrefs::dom_selection_mimic_chrome_tostring_enabled()) {
    return true;
  }

  for (const nsIContent* content = this; content;
       content = content->GetFlattenedTreeParent()) {
    if (content->IsEditable()) {
      return true;
    }
    nsIFrame* frame = content->GetPrimaryFrame();
    if (!frame) {
      return true;
    }
    if (!frame->IsSelectable()) {
      return false;
    }
  }

  return true;
}

Element* nsIContent::GetFocusDelegate(IsFocusableFlags aFlags) const {
  const nsIContent* whereToLook = this;
  if (ShadowRoot* root = GetShadowRoot()) {
    if (!root->DelegatesFocus()) {
      // 1. If focusTarget is a shadow host and its shadow root 's delegates
      // focus is false, then return null.
      return nullptr;
    }
    whereToLook = root;
  }

  auto IsFocusable = [&](Element* aElement) -> Focusable {
    nsIFrame* frame = aElement->GetPrimaryFrame();

    if (!frame) {
      return {};
    }

    return frame->IsFocusable(aFlags);
  };

  Element* potentialFocus = nullptr;
  for (nsINode* node = whereToLook->GetFirstChild(); node;
       node = node->GetNextNode(whereToLook)) {
    auto* el = Element::FromNode(*node);
    if (!el) {
      continue;
    }

    const bool autofocus = el->GetBoolAttr(nsGkAtoms::autofocus);

    if (autofocus) {
      if (IsFocusable(el)) {
        // Found an autofocus candidate.
        return el;
      }
    } else if (!potentialFocus) {
      if (Focusable focusable = IsFocusable(el)) {
        if (IsHTMLElement(nsGkAtoms::dialog)) {
          if (focusable.mTabIndex >= 0) {
            // If focusTarget is a dialog element and descendant is sequentially
            // focusable, then set focusableArea to descendant.
            potentialFocus = el;
          }
        } else {
          // This element could be the one if we can't find an
          // autofocus candidate which has the precedence.
          potentialFocus = el;
        }
      }
    }

    if (!autofocus && potentialFocus) {
      // Nothing else to do, we are not looking for more focusable elements
      // here.
      continue;
    }

    if (auto* shadow = el->GetShadowRoot()) {
      if (shadow->DelegatesFocus()) {
        if (Element* delegatedFocus = shadow->GetFocusDelegate(aFlags)) {
          if (autofocus) {
            // This element has autofocus and we found an focus delegates
            // in its descendants, so use the focus delegates
            return delegatedFocus;
          }
          if (!potentialFocus) {
            potentialFocus = delegatedFocus;
          }
        }
      }
    }
  }

  return potentialFocus;
}

Focusable nsIContent::IsFocusableWithoutStyle(IsFocusableFlags) {
  // Default, not tabbable
  return {};
}

void nsIContent::SetAssignedSlot(HTMLSlotElement* aSlot) {
  MOZ_ASSERT(aSlot || GetExistingExtendedContentSlots());
  ExtendedContentSlots()->mAssignedSlot = aSlot;
}

#ifdef MOZ_DOM_LIST
void nsIContent::Dump() { List(); }
#endif
