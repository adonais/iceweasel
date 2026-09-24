/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DirectionalityUtils_h_
#define DirectionalityUtils_h_

#include "mozilla/Directionality.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/HTMLSlotElement.h"
#include "mozilla/dom/Text.h"
#include "nsIContentInlines.h"
#include "nsStringFwd.h"
#include "nscore.h"

class nsIContent;
class nsINode;
class nsAttrValue;

namespace mozilla::dom {
class HTMLSlotElement;
class ShadowRoot;
struct UnbindContext;
}  // namespace mozilla::dom

namespace mozilla {

inline bool MayAffectDirAutoElement(const nsINode* aNode) {
  return aNode &&
         (aNode->NodeOrAncestorHasDirAuto() || aNode->AffectsDirAutoSlot());
}

/**
 * If dir!=ltr we can't anymore assume all elements in this document are LTR.
 */
inline void MaybeSetDocNeedsDirHandling(dom::Element* aElement,
                                        const nsAttrValue* aValue) {
  if (aValue && aValue->Type() == nsAttrValue::eEnum &&
      Directionality(aValue->GetEnumValue()) != Directionality::Ltr) {
    // nsINode::CloneAndAdopt sets the flag when adopting to another document.
    aElement->OwnerDoc()->SetNeedsDirHandling();
  }
}

/**
 * Various methods for returning the directionality of a string using the
 * first-strong algorithm defined in http://unicode.org/reports/tr9/#P2
 *
 * @param[out] aFirstStrong the offset to the first character in the string with
 *             strong directionality, or UINT32_MAX if there is none (in which
 *             case the return value is Directionality::Unset).
 * @return the directionality of the string, or Unset if not available.
 */
Directionality GetDirectionFromText(const char16_t* aText,
                                    const uint32_t aLength,
                                    uint32_t* aFirstStrong = nullptr);

/**
 * Set the directionality of an element according to the algorithm defined at
 * https://html.spec.whatwg.org/#the-directionality, not including elements with
 * auto direction.
 *
 * @return the directionality that the element was set to
 */
Directionality RecomputeDirectionality(mozilla::dom::Element* aElement,
                                       bool aNotify = true);

/**
 * Set the directionality of any descendants of a node that do not themselves
 * have a dir attribute.
 * For performance reasons we walk down the descendant tree in the rare case
 * of setting the dir attribute, rather than walking up the ancestor tree in
 * the much more common case of getting the element's directionality.
 */
void SetDirectionalityOnDescendants(mozilla::dom::Element* aElement,
                                    Directionality aDir, bool aNotify = true);

/**
 * Update flags on assigned node and auto directionality of the slot.
 */
void SlotAssignedNodeAddedForDir(dom::HTMLSlotElement* aSlot,
                                 nsIContent& aAssignedNode);

/**
 * Update flags on assigned node and auto directionality of the slot.
 */
void SlotAssignedNodeRemovedForDir(dom::HTMLSlotElement* aSlot,
                                   nsIContent& aUnassignedNode);

bool TextNodeWillChangeDirectionInternal(dom::Text*, Directionality*, uint32_t);

/**
 * When the contents of a text node are about to change, retrieve the current
 * directionality of the text
 *
 * @return whether the text node affects the directionality of any element
 */
inline bool TextNodeWillChangeDirection(dom::Text* aTextNode,
                                        Directionality* aOldDir,
                                        uint32_t aOffset) {
  if (!MayAffectDirAutoElement(aTextNode)) {
    return false;
  }
  return TextNodeWillChangeDirectionInternal(aTextNode, aOldDir, aOffset);
}

/**
 * After the contents of a text node have changed, change the directionality
 * of any elements whose directionality is determined by that node
 */
void TextNodeChangedDirection(dom::Text* aTextNode, Directionality aOldDir,
                              bool aNotify);

void SetDirectionFromNewTextNodeInternal(dom::Text*, nsINode*);

/**
 * When a text node is appended to an element, find any ancestors with dir=auto
 * whose directionality will be determined by the text node
 */
inline void SetDirectionFromNewTextNode(dom::Text* aTextNode,
                                        nsINode* aParent) {
  if (MayAffectDirAutoElement(aParent)) {
    SetDirectionFromNewTextNodeInternal(aTextNode, aParent);
  }
}

void ResetDirectionSetByTextNodeInternal(dom::Text*, dom::UnbindContext&);

/**
 * When a text node is removed from a document, find any ancestors whose
 * directionality it determined and redetermine their directionality
 */
inline void ResetDirectionSetByTextNode(dom::Text* aTextNode,
                                        dom::UnbindContext& aContext) {
  if (aTextNode->MaySetDirAuto()) {
    ResetDirectionSetByTextNodeInternal(aTextNode, aContext);
  }
}

void ResetDirectionSetBySlotHostInternal(dom::HTMLSlotElement*,
                                         dom::UnbindContext&, dom::ShadowRoot*);

/**
 * Similar to text nodes, slots can also determine the directionality of
 * ancestors. These need to be updated if the slot is removed.
 * https://html.spec.whatwg.org/#contained-text-auto-directionality
 */
inline void ResetDirectionSetBySlotHost(dom::HTMLSlotElement* aSlot,
                                        dom::UnbindContext& aContext,
                                        dom::ShadowRoot* aOldContainingShadow) {
  if (MayAffectDirAutoElement(aSlot)) {
    ResetDirectionSetBySlotHostInternal(aSlot, aContext, aOldContainingShadow);
  }
}

void ResetDirFormAssociatedElementInternal(dom::Element*, bool, bool,
                                           const nsAString*);

/**
 * Update directionality of this and other affected elements.
 */
inline void ResetDirFormAssociatedElement(
    mozilla::dom::Element* aElement, bool aNotify, bool aHasDirAuto,
    const nsAString* aKnownValue = nullptr) {
  if (aElement->OwnerDoc()->NeedsDirHandling()) {
    ResetDirFormAssociatedElementInternal(aElement, aNotify, aHasDirAuto,
                                          aKnownValue);
  }
}

/**
 * Called when setting the dir attribute on an element, immediately after
 * AfterSetAttr. This is instead of using BeforeSetAttr or AfterSetAttr, because
 * in AfterSetAttr we don't know the old value, so we can't identify all cases
 * where we need to walk up or down the document tree and reset the direction;
 * and in BeforeSetAttr we can't do the walk because this element hasn't had the
 * value set yet so the results will be wrong.
 */
void OnSetDirAttr(mozilla::dom::Element* aElement, const nsAttrValue* aNewValue,
                  bool hadValidDir, bool hadDirAuto, bool aNotify);

void SetDirOnBindInternal(dom::Element*, nsIContent*);

/**
 * Called when binding a new element to the tree, to set the
 * NodeAncestorHasDirAuto flag and set the direction of the element and its
 * ancestors if necessary
 */
inline void SetDirOnBind(mozilla::dom::Element* aElement, nsIContent* aParent) {
  if (!aElement->OwnerDoc()->NeedsDirHandling()) {
    MOZ_ASSERT(!aElement->State().HasAtLeastOneOfStates(
        dom::ElementState::HAS_DIR_ATTR_RTL |
        dom::ElementState::HAS_DIR_ATTR_LIKE_AUTO));
    aElement->SetDirectionality(Directionality::Ltr, false);
    return;
  }
  SetDirOnBindInternal(aElement, aParent);
}

/**
 * Called when unbinding an element from the tree, to recompute the
 * directionality of the element if it doesn't have autodirection, and to
 * clean up any entries in nsTextDirectionalityMap that refer to it.
 */
inline void ResetDir(mozilla::dom::Element* aElement) {
  if (aElement->OwnerDoc()->NeedsDirHandling() && !aElement->HasDirAuto()) {
    RecomputeDirectionality(aElement, false);
  }
}
}  // end namespace mozilla

#endif /* DirectionalityUtils_h_ */
