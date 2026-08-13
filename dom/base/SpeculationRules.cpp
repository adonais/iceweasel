/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SpeculationRules.h"

#include "mozilla/CycleCollectedJSContext.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/PrefetchCandidates.h"
#include "mozilla/dom/ReferrerPolicyBinding.h"
#include "mozilla/dom/SpeculationRuleSet.h"
#include "mozilla/dom/speculationrules_ffi_generated.h"
#include "nsCycleCollectionParticipant.h"
#include "nsIScriptElement.h"
#include "nsIURI.h"

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

  // Step 2.
  UniquePtr<PrefetchCandidates> prefetchCandidates =
      PrefetchCandidates::Create();
  // Step 3.
  for (auto& entry : mRuleSetsFromScript) {
    entry.GetData()->ConsiderLoads(prefetchCandidates.get());
  }

  // Step 4.
  // TODO(avandolder): Cancel and discard existing speculation rules prefetch
  // records that are not still being speculated given prefetchCandidates.

  // Step 5-6.
  // Here, we group the candidates in-place, unlike the spec.
  prefetchCandidates->Group();

  // Step 7 runs in various cases when we decide to actually fire a prefetch
  // based on the eagerness value of the candidates.
  // Currently, we only support immediate eagerness, and we fire these
  // prefetches now.
  for ([[maybe_unused]] PrefetchCandidate& candidate :
       prefetchCandidates->AsArray()) {
    // TODO(avandolder): Create a prefetch record and start a referrer-initiated
    // navigational prefetch given candidate.
  }
}

}  // namespace mozilla::dom
