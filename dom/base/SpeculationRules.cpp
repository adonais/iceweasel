/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SpeculationRules.h"

#include "mozilla/CycleCollectedJSContext.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/PrefetchCandidates.h"
#include "mozilla/dom/ReferrerPolicyBinding.h"
#include "mozilla/dom/SpeculationRuleSet.h"
#include "mozilla/dom/SpeculationRulesManager.h"
#include "mozilla/dom/speculationrules_ffi_generated.h"
#include "nsContentUtils.h"
#include "nsCycleCollectionParticipant.h"
#include "nsIFrame.h"
#include "nsIScriptElement.h"
#include "nsIURI.h"
#include "nsTArray.h"

namespace mozilla::dom {

#define STATIC_ASSERT_REFERRER_POLICY_EQ(cpp_, rust_) \
  static_assert(                                      \
      ReferrerPolicy::cpp_ ==                         \
      static_cast<ReferrerPolicy>(SpeculationRulesReferrerPolicy::rust_))

STATIC_ASSERT_REFERRER_POLICY_EQ(_empty, Empty);
STATIC_ASSERT_REFERRER_POLICY_EQ(No_referrer, NoReferrer);
STATIC_ASSERT_REFERRER_POLICY_EQ(No_referrer_when_downgrade,
                                 NoReferrerWhenDowngrade);
STATIC_ASSERT_REFERRER_POLICY_EQ(Origin, Origin);
STATIC_ASSERT_REFERRER_POLICY_EQ(Origin_when_cross_origin,
                                 OriginWhenCrossOrigin);
STATIC_ASSERT_REFERRER_POLICY_EQ(Unsafe_url, UnsafeUrl);
STATIC_ASSERT_REFERRER_POLICY_EQ(Same_origin, SameOrigin);
STATIC_ASSERT_REFERRER_POLICY_EQ(Strict_origin, StrictOrigin);
STATIC_ASSERT_REFERRER_POLICY_EQ(Strict_origin_when_cross_origin,
                                 StrictOriginWhenCrossOrigin);

#undef STATIC_ASSERT_REFERRER_POLICY_EQ

extern "C" {

bool Gecko_Element_GetHrefURI(const Element* aElement, nsACString* aSpec) {
  nsCOMPtr<nsIURI> uri = aElement->GetHrefURI();
  if (!uri) {
    return false;
  }
  if (NS_FAILED(uri->GetSpec(*aSpec))) {
    return false;
  }
  return true;
}

SpeculationRulesReferrerPolicy Gecko_Element_GetReferrerPolicy(
    const Element* aElement) {
  // https://html.spec.whatwg.org/#hyperlink-referrer-policy
  if (nsContentUtils::HasRelNoReferrer(*aElement)) {
    return SpeculationRulesReferrerPolicy::NoReferrer;
  }
  return static_cast<SpeculationRulesReferrerPolicy>(
      aElement->GetReferrerPolicyAsEnum());
}

}  // extern "C"

NS_IMPL_CYCLE_COLLECTION_CLASS(SpeculationRules)

NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN(SpeculationRules)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mDocument)
  for (const auto& entry : tmp->mRuleSetsFromScript) {
    NS_CYCLE_COLLECTION_NOTE_EDGE_NAME(cb, "mRuleSetsFromScript key");
    cb.NoteXPCOMChild(entry.GetKey());
  }
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN(SpeculationRules)
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mDocument)
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mRuleSetsFromScript)
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

SpeculationRules::SpeculationRules(Document* aDocument)
    : mDocument(aDocument) {}

// https://html.spec.whatwg.org/#register-speculation-rules
void SpeculationRules::RegisterFromScript(
    nsIScriptElement* aScriptElement, UniquePtr<SpeculationRuleSet> aRuleSet) {
  aRuleSet->SetUseCounters(*mDocument);
  // Step 2.
  mRuleSetsFromScript.InsertOrUpdate(aScriptElement, std::move(aRuleSet));
  // Step 3.
  ConsiderLoads();
}

// html.spec.whatwg.org/#unregister-speculation-rules
void SpeculationRules::Unregister(nsIScriptElement* aScriptElement) {
  // Step 2.
  mRuleSetsFromScript.Remove(aScriptElement);
  // Step 3.
  ConsiderLoads();
}

namespace {

class ConsiderSpeculativeLoadsMicrotask final
    : public mozilla::MicroTaskRunnable {
 public:
  explicit ConsiderSpeculativeLoadsMicrotask(
      SpeculationRules* aSpeculationRules)
      : mSpeculationRules(aSpeculationRules) {}

  void Run(AutoSlowOperation& /* unused */) override {
    mSpeculationRules->InnerConsiderLoads();
  }

 private:
  RefPtr<SpeculationRules> mSpeculationRules;
};

}  // namespace

// https://html.spec.whatwg.org/#consider-speculative-loads
void SpeculationRules::ConsiderLoads() {
  // Steps 1-2.
  if (!mDocument->IsTopLevelContentDocument() ||
      mConsiderSpeculativeLoadsMicrotaskQueued) {
    return;
  }
  if (CycleCollectedJSContext* context = CycleCollectedJSContext::Get()) {
    // Step 3.
    mConsiderSpeculativeLoadsMicrotaskQueued = true;
    // Step 4.
    RefPtr mt = MakeRefPtr<ConsiderSpeculativeLoadsMicrotask>(this);
    context->DispatchToMicroTask(mt.forget());
  }
}

// https://html.spec.whatwg.org/#inner-consider-speculative-loads-steps
void SpeculationRules::InnerConsiderLoads() {
  mConsiderSpeculativeLoadsMicrotaskQueued = false;

  // Step 1.
  if (!mDocument || !mDocument->IsFullyActive()) {
    return;
  }

  // https://html.spec.whatwg.org/#find-matching-links
  // The result doesn't depend on any particular rule set, so it's computed
  // once here and shared across every rule set's ConsiderLoads call below.
  nsTArray<const Element*> links;
  FindMatchingLinks(links);

  // Step 2.
  UniquePtr<PrefetchCandidates> prefetchCandidates =
      PrefetchCandidates::Create();
  // Step 3.
  for (auto& entry : mRuleSetsFromScript) {
    entry.GetData()->ConsiderLoads(prefetchCandidates.get(), links);
  }

  // Step 4.
  if (SpeculationRulesManager* srm = mDocument->GetSpeculationRulesManager()) {
    srm->CancelStalePrefetches(prefetchCandidates->AsArray());
  }

  // Step 5-6.
  // Here, we group the candidates in-place, unlike the spec.
  prefetchCandidates->Group();

  // Step 7 runs in various cases when we decide to actually fire a prefetch
  // based on the eagerness value of the candidates.
  // Currently, we only support immediate eagerness, and we fire these
  // prefetches now.
  SpeculationRulesManager* srm = mDocument->EnsureSpeculationRulesManager();
  for (PrefetchCandidate& candidate : prefetchCandidates->AsArray()) {
    srm->StartPrefetch(mDocument, candidate);
  }
}

// https://html.spec.whatwg.org/#find-matching-links
void SpeculationRules::FindMatchingLinks(nsTArray<const Element*>& aLinks) {
  // Step 2.
  // Rather than walking the tree, we iterate the set of <a>/<area> elements
  // with an href that are connected to the document. The iteration order is
  // therefore not shadow-including tree order, but the resulting candidates
  // are deduplicated and grouped before being enacted, so order is not
  // significant.
  for (Element* element : mLinks) {
    // Step 2.1.
    // mLinks already only contains a or area elements with href attributes.

    // Step 2.2. If descendant is not being rendered or is part of skipped
    //           contents, then continue.
    nsIFrame* frame = element->GetPrimaryFrame();
    if (!frame || frame->IsHiddenByContentVisibilityOnAnyAncestor()) {
      continue;
    }

    // Step 2.3. If descendant's url is null, or its scheme is not an HTTP(S)
    //           scheme, then continue.
    nsCOMPtr<nsIURI> uri = element->GetHrefURI();
    if (!uri || !net::SchemeIsHttpOrHttps(uri)) {
      continue;
    }

    // Step 2.4.
    // The document rule predicate is applied per rule set when considering
    // speculative loads, so every candidate link is appended here.
    aLinks.AppendElement(element);
  }

  // 3. Return links.
}

}  // namespace mozilla::dom
