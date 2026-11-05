/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AntiTrackingOpenerHeuristics.h"
#include "AntiTrackingUtils.h"
#include "ContentBlockingNotifier.h"
#include "StorageAccessAPIHelper.h"

#include "mozilla/BasePrincipal.h"
#include "mozilla/MozPromise.h"
#include "mozilla/StaticPrefs_privacy.h"
#include "mozilla/dom/BrowsingContext.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/WebIdentityHandler.h"
#include "nsContentUtils.h"
#include "nsGlobalWindowOuter.h"
#include "nsICookieJarSettings.h"
#include "nsIURI.h"
#include "nsPIDOMWindow.h"
#include "nsPIDOMWindowInlines.h"
#include "nsThreadUtils.h"

namespace mozilla {

void MaybeAllowStorageForOpenerAfterUserInteraction(
    dom::Document* aDocument, bool aHadPriorUserInteraction) {
  MOZ_ASSERT(aDocument);

  if (!aDocument->CookieJarSettings()->GetRejectThirdPartyContexts()) {
    return;
  }

  // This will probably change for project fission, but currently this document
  // and the opener are on the same process. In the future, we should make this
  // part async.
  nsPIDOMWindowInner* inner = aDocument->GetInnerWindow();
  if (NS_WARN_IF(!inner)) {
    return;
  }

  // Don't trigger opener heuristic for first-party trackers if the pref
  // says so.
  if (StaticPrefs::
          privacy_restrict3rdpartystorage_heuristic_exclude_third_party_trackers() &&
      nsContentUtils::IsFirstPartyTrackingResourceWindow(inner)) {
    return;
  }

  auto* outer = nsGlobalWindowOuter::Cast(inner->GetOuterWindow());
  if (NS_WARN_IF(!outer)) {
    return;
  }

  RefPtr<dom::BrowsingContext> openerBC = outer->GetOpenerBrowsingContext();
  if (!openerBC) {
    // No opener.
    return;
  }

  // We want to ensure the following check works for both fission mode and
  // non-fission mode:
  // "If the opener is not a 3rd party and if this window is not a 3rd party
  // with respect to the opener, we should not continue."
  //
  // In non-fission mode, the opener and the opened window are in the same
  // process, we can use AntiTrackingUtils::IsThirdPartyWindow to do the check.
  // In fission mode, if this window is not a 3rd party with respect to the
  // opener, they must be in the same process, so we can still use
  // IsThirdPartyWindow(openerInner) to continue to check if the opener is a 3rd
  // party.
  if (openerBC->IsInProcess()) {
    nsCOMPtr<nsPIDOMWindowOuter> outerOpener = openerBC->GetDOMWindow();
    if (NS_WARN_IF(!outerOpener)) {
      return;
    }

    nsCOMPtr<nsPIDOMWindowInner> openerInner =
        outerOpener->GetCurrentInnerWindow();
    if (NS_WARN_IF(!openerInner)) {
      return;
    }

    RefPtr<dom::Document> openerDocument = openerInner->GetExtantDoc();
    if (NS_WARN_IF(!openerDocument)) {
      return;
    }

    nsCOMPtr<nsIURI> openerURI = openerDocument->GetDocumentURI();
    if (NS_WARN_IF(!openerURI)) {
      return;
    }

    // If the opener is not a 3rd party and if this window is not
    // a 3rd party with respect to the opener, we should not continue.
    if (!AntiTrackingUtils::IsThirdPartyWindow(inner, openerURI) &&
        !AntiTrackingUtils::IsThirdPartyWindow(openerInner, nullptr)) {
      return;
    }
  }

  RefPtr<dom::Document> doc(aDocument);
  dom::WebIdentityHandler* identityHandler =
      inner->GetOrCreateWebIdentityHandler();
  MOZ_ASSERT(identityHandler);
  identityHandler->IsContinuationWindow()->Then(
      GetCurrentSerialEventTarget(), __func__,
      [doc, openerBC, aHadPriorUserInteraction](
          const MozPromise<bool, nsresult, true>::ResolveOrRejectValue&
              result) {
        if (!result.IsResolve() || !result.ResolveValue()) {
          if (XRE_IsParentProcess()) {
            (void)StorageAccessAPIHelper::AllowAccessForOnParentProcess(
                doc->NodePrincipal(), openerBC,
                ContentBlockingNotifier::eOpenerAfterUserInteraction, nullptr,
                Some(aHadPriorUserInteraction));
          } else {
            (void)StorageAccessAPIHelper::AllowAccessForOnChildProcess(
                doc->NodePrincipal(), openerBC,
                ContentBlockingNotifier::eOpenerAfterUserInteraction, nullptr,
                Some(aHadPriorUserInteraction));
          }
        }
      });
}

void MaybeAllowStorageForOpenedWindow(nsPIDOMWindowOuter* aOpener,
                                      nsIURI* aURI) {
  MOZ_ASSERT(aOpener);

  nsPIDOMWindowInner* inner = aOpener->GetCurrentInnerWindow();
  if (NS_WARN_IF(!inner)) {
    return;
  }

  // Don't trigger the heuristic for third-party trackers.
  if (StaticPrefs::
          privacy_restrict3rdpartystorage_heuristic_exclude_third_party_trackers() &&
      nsContentUtils::IsThirdPartyTrackingResourceWindow(inner)) {
    return;
  }

  // No 3rd party URL/window.
  if (!AntiTrackingUtils::IsThirdPartyWindow(inner, aURI)) {
    return;
  }

  dom::Document* doc = inner->GetDoc();
  if (!doc) {
    return;
  }
  nsCOMPtr<nsIPrincipal> principal = BasePrincipal::CreateContentPrincipal(
      aURI, doc->NodePrincipal()->OriginAttributesRef());

  // We don't care when the asynchronous work finishes here.
  // Without e10s or fission enabled this is run in the parent process.
  if (XRE_IsParentProcess()) {
    (void)StorageAccessAPIHelper::AllowAccessForOnParentProcess(
        principal, aOpener->GetBrowsingContext(),
        ContentBlockingNotifier::eOpener);
  } else {
    (void)StorageAccessAPIHelper::AllowAccessForOnChildProcess(
        principal, aOpener->GetBrowsingContext(),
        ContentBlockingNotifier::eOpener);
  }
}

}  // namespace mozilla
