/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SpeculationRules.h"

#include "mozilla/CycleCollectedJSContext.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/PrefetchCandidates.h"
#include "mozilla/dom/PrefetchLog.h"
#include "mozilla/dom/ReferrerPolicyBinding.h"
#include "mozilla/dom/SpeculationRuleSet.h"
#include "mozilla/dom/SpeculationRulesManager.h"
#include "mozilla/dom/speculationrules_ffi_generated.h"
#include "nsContentUtils.h"
#include "nsCycleCollectionParticipant.h"
#include "nsIContentInlines.h"
#include "nsIFrame.h"
#include "nsIScriptElement.h"
#include "nsITimer.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsTArray.h"
#include "nsTHashMap.h"

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
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mHoverLink)
  for (const auto& entry : tmp->mRuleSetsFromScript) {
    NS_CYCLE_COLLECTION_NOTE_EDGE_NAME(cb, "mRuleSetsFromScript key");
    cb.NoteXPCOMChild(entry.GetKey());
  }
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN(SpeculationRules)
  tmp->CancelHoverTimer();
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mDocument)
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mRuleSetsFromScript)
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mHoverLink)
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

SpeculationRules::SpeculationRules(Document* aDocument)
    : mDocument(aDocument) {}

SpeculationRules::~SpeculationRules() { CancelHoverTimer(); }

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
  mCandidateGroups = prefetchCandidates->AsArray();

  // Step 7 runs in various cases when we decide to actually fire a prefetch
  // based on the eagerness value of the candidates. Immediate candidates are
  // fired now; the less eager ones wait in mCandidateGroups until the user
  // shows interest in a link matching them.
  EnactCandidates(nullptr, Eagerness::Immediate);
}

void SpeculationRules::EnactCandidates(nsIURI* aURL, Eagerness aTriggerLevel) {
  LOG_SPECRULES(("EnactCandidates: %zu group(s), eagerness>=%d, url=%s",
                 mCandidateGroups.Length(), static_cast<int>(aTriggerLevel),
                 aURL ? aURL->GetSpecOrDefault().get() : "(any)"));
  if (mCandidateGroups.IsEmpty() || !mDocument || !mDocument->IsFullyActive()) {
    return;
  }

  // The groups for one URL are all redundant with each other, so of those that
  // are eager enough, only the least eager one is enacted: it is the one whose
  // tags were collected from every candidate the trigger justifies.
  nsTHashMap<nsCString, const PrefetchCandidate*> leastEager;
  for (const PrefetchCandidate& candidate : mCandidateGroups) {
    if (candidate.eagerness < aTriggerLevel) {
      continue;
    }

    nsCOMPtr<nsIURI> candidateUri;
    if (NS_FAILED(NS_NewURI(getter_AddRefs(candidateUri), candidate.url))) {
      continue;
    }

    nsIURI* documentUri = mDocument->GetDocumentURI();
    if (bool equals = false;
        documentUri &&
        NS_SUCCEEDED(documentUri->EqualsExceptRef(candidateUri, &equals)) &&
        equals) {
      continue;
    }

    if (aURL) {
      // Candidate URLs are serialized by the Rust URL parser, so they are
      // compared as URIs rather than as strings, to avoid relying on it and
      // nsIURI agreeing on a normal form.
      bool equals = false;
      if (NS_FAILED(aURL->Equals(candidateUri, &equals)) || !equals) {
        continue;
      }
    }

    const PrefetchCandidate*& slot =
        leastEager.LookupOrInsert(candidate.url, nullptr);
    if (!slot || candidate.eagerness < slot->eagerness) {
      slot = &candidate;
    }
  }

  if (leastEager.IsEmpty()) {
    return;
  }

  SpeculationRulesManager* srm = mDocument->EnsureSpeculationRulesManager();
  for (const PrefetchCandidate* candidate : leastEager.Values()) {
    srm->StartPrefetch(mDocument, *candidate);
  }
}

void SpeculationRules::AddLink(Element* aElement) {
  mLinks.Insert(aElement);
  ConsiderLoads();
}

void SpeculationRules::RemoveLink(Element* aElement) {
  mLinks.Remove(aElement);
  if (mDocument && mDocument->IsFullyActive()) {
    // Link elements are removed when a document is being cycle-collected; we
    // shouldn't bother firing the microtask in that case.
    ConsiderLoads();
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

Element* SpeculationRules::FindInterestedLink(nsIContent* aContent) const {
  for (nsIContent* content = aContent; content;
       content = content->GetFlattenedTreeParent()) {
    if (content->IsElement() && mLinks.Contains(content->AsElement())) {
      return content->AsElement();
    }
  }
  return nullptr;
}

void SpeculationRules::HoverContentChanged(nsIContent* aContent) {
  if (mCandidateGroups.IsEmpty()) {
    return;
  }

  RefPtr<Element> link = FindInterestedLink(aContent);
  if (link == mHoverLink) {
    // The cursor moved within the same link, so it has been hovered
    // continuously: let the timer keep running, or stay expired if the link has
    // already been enacted.
    return;
  }

  CancelHoverTimer();
  mHoverLink = link;
  if (!mHoverLink) {
    return;
  }

  // Enacting at the moderate level also covers eager candidates, so a
  // separate eager stage is only worthwhile when it would fire sooner.
  uint32_t eagerDelay =
      StaticPrefs::dom_speculation_rules_eager_hover_delay_ms();
  uint32_t moderateDelay =
      StaticPrefs::dom_speculation_rules_moderate_hover_delay_ms();
  if (eagerDelay < moderateDelay) {
    ArmHoverTimer(eagerDelay, Eagerness::Eager);
  } else {
    ArmHoverTimer(moderateDelay, Eagerness::Moderate);
  }
}

void SpeculationRules::ArmHoverTimer(uint32_t aDelayMs, Eagerness aLevel) {
  mHoverTimerLevel = aLevel;
  // The timer holds no reference to us, so it must not outlive us; both the
  // destructor and the cycle collector cancel it.
  NS_NewTimerWithFuncCallback(getter_AddRefs(mHoverTimer), HoverTimerFired,
                              this, aDelayMs, nsITimer::TYPE_ONE_SHOT,
                              "SpeculationRules::HoverTimerFired"_ns);
}

void SpeculationRules::CancelHoverTimer() {
  if (mHoverTimer) {
    mHoverTimer->Cancel();
    mHoverTimer = nullptr;
  }
  mHoverLink = nullptr;
}

/* static */
void SpeculationRules::HoverTimerFired(nsITimer* aTimer, void* aClosure) {
  RefPtr speculationRules = static_cast<SpeculationRules*>(aClosure);
  speculationRules->mHoverTimer = nullptr;

  // mHoverLink is deliberately left set, so that moving the cursor around
  // within the link it names doesn't arm the timer all over again. It is
  // cleared once the cursor moves on to a different link, or off of links
  // entirely.
  RefPtr<Element> link = speculationRules->mHoverLink;
  if (!link || !link->IsInComposedDoc()) {
    return;
  }
  Eagerness level = speculationRules->mHoverTimerLevel;
  if (nsCOMPtr<nsIURI> uri = link->GetHrefURI()) {
    speculationRules->EnactCandidates(uri, level);

    if (level == Eagerness::Eager) {
      uint32_t eagerDelay =
          StaticPrefs::dom_speculation_rules_eager_hover_delay_ms();
      uint32_t moderateDelay =
          StaticPrefs::dom_speculation_rules_moderate_hover_delay_ms();
      if (moderateDelay > eagerDelay) {
        speculationRules->ArmHoverTimer(moderateDelay - eagerDelay,
                                        Eagerness::Moderate);
      } else {
        // The moderate delay is the same as or shorter than the eager delay,
        // so just enact the moderate candidates now as well.
        speculationRules->EnactCandidates(uri, Eagerness::Moderate);
      }
    }
  }
}

void SpeculationRules::PointerDown(Element* aLink) {
  if (mCandidateGroups.IsEmpty()) {
    return;
  }

  if (nsCOMPtr<nsIURI> uri = aLink->GetHrefURI()) {
    EnactCandidates(uri, Eagerness::Conservative);
  }
}

}  // namespace mozilla::dom
