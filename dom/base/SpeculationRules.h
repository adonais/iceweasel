/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SpeculationRules_h
#define mozilla_dom_SpeculationRules_h

#include "mozilla/UniquePtr.h"
#include "nsClassHashtable.h"
#include "nsCycleCollectionParticipant.h"
#include "nsHashKeys.h"
#include "nsTArrayForwardDeclare.h"
#include "nsTHashSet.h"

class nsIScriptElement;

namespace mozilla::dom {

class Document;
class Element;
class SpeculationRuleSet;

class SpeculationRules final {
 public:
  NS_INLINE_DECL_CYCLE_COLLECTING_NATIVE_REFCOUNTING(SpeculationRules)
  NS_DECL_CYCLE_COLLECTION_NATIVE_CLASS(SpeculationRules)

  explicit SpeculationRules(Document* aDocument);

  void RegisterFromScript(nsIScriptElement* aScriptElement,
                          UniquePtr<SpeculationRuleSet> aRuleSet);
  void Unregister(nsIScriptElement* aScriptElement);

  void ConsiderLoads();
  void InnerConsiderLoads();

  void AddLink(Element* aElement) { mLinks.Insert(aElement); }
  void RemoveLink(Element* aElement) { mLinks.Remove(aElement); }

  void FindMatchingLinks(nsTArray<const Element*>& aLinks);

 private:
  virtual ~SpeculationRules() = default;

  RefPtr<Document> mDocument;

  // https://html.spec.whatwg.org/#document-sr-sets
  nsClassHashtable<nsRefPtrHashKey<nsIScriptElement>, SpeculationRuleSet>
      mRuleSetsFromScript;

  // https://html.spec.whatwg.org/#consider-speculative-loads-microtask-queued
  bool mConsiderSpeculativeLoadsMicrotaskQueued{false};

  // The set of HTML <a> and <area> elements with an href attribute that are
  // connected to this document. This is tracked so FindMatchingLinks doesn't
  // have to walk the document tree every time speculative loads are considered.
  // These are non-owning pointers; the elements should remove themselves when
  // they are unbound from the document or lose their href attribute.
  nsTHashSet<Element*> mLinks;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_SpeculationRules_h
