/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SpeechModelDownloadPermissionRequest.h"

#include "mozilla/PermissionDelegateHandler.h"
#include "mozilla/Preferences.h"
#include "mozilla/dom/BrowsingContext.h"
#include "mozilla/dom/CanonicalBrowsingContext.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/WindowGlobalParent.h"
#include "nsContentPermissionHelper.h"
#include "nsPrintfCString.h"

namespace mozilla::dom {

// The parent-process permission doorhanger for a model download. Reuses the
// existing "speech-recognition-model-download" permission type and its
// PermissionUI.sys.mjs prompt. On Allow it resolves the authorization with
// true (the actual download is performed by HWInferenceParent); on Cancel with
// false.
class SpeechModelDownloadPermissionRequest final
    : public nsIContentPermissionRequest {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSICONTENTPERMISSIONREQUEST

  SpeechModelDownloadPermissionRequest(nsIPrincipal* aPrincipal,
                                       nsIPrincipal* aTopLevelPrincipal,
                                       Element* aElement,
                                       const SpeechModelIdentifier& aModel,
                                       const nsAString& aProgressToken,
                                       std::function<void(bool)>&& aResolver)
      : mPrincipal(aPrincipal),
        mTopLevelPrincipal(aTopLevelPrincipal),
        mElement(aElement),
        mModel(aModel),
        mProgressToken(aProgressToken),
        mResolver(std::move(aResolver)) {}

  // Settles the pending install(). Safe to call more than once; only the first
  // call runs the resolver. Not the virtual Cancel(), so it can be called from
  // non-MOZ_CAN_RUN_SCRIPT contexts (e.g. a failed AskPermission).
  void Resolve(bool aSuccess) {
    if (mResolver) {
      auto resolver = std::move(mResolver);
      mResolver = nullptr;
      resolver(aSuccess);
    }
  }

 private:
  ~SpeechModelDownloadPermissionRequest() { Resolve(false); }

  nsCOMPtr<nsIPrincipal> mPrincipal;
  nsCOMPtr<nsIPrincipal> mTopLevelPrincipal;
  RefPtr<Element> mElement;
  SpeechModelIdentifier mModel;
  nsString mProgressToken;
  std::function<void(bool)> mResolver;
};

NS_IMPL_ISUPPORTS(SpeechModelDownloadPermissionRequest,
                  nsIContentPermissionRequest)

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetTypes(nsIArray** aTypes) {
  nsTArray<nsString> options;
  options.AppendElement(
      NS_ConvertUTF8toUTF16(nsPrintfCString("%u", mModel.mSizeMB)));
  options.AppendElement(mProgressToken);
  return nsContentPermissionUtils::CreatePermissionArray(
      "speech-recognition-model-download"_ns, options, aTypes);
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetPrincipal(nsIPrincipal** aPrincipal) {
  NS_IF_ADDREF(*aPrincipal = mPrincipal);
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetTopLevelPrincipal(
    nsIPrincipal** aTopLevelPrincipal) {
  NS_IF_ADDREF(*aTopLevelPrincipal = mTopLevelPrincipal);
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetDelegatePrincipal(
    const nsACString& aType, nsIPrincipal** aPrincipal) {
  return PermissionDelegateHandler::GetDelegatePrincipal(aType, this,
                                                         aPrincipal);
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetWindow(mozIDOMWindow** aWindow) {
  *aWindow = nullptr;
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetElement(Element** aElement) {
  NS_IF_ADDREF(*aElement = mElement);
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetHasValidTransientUserGestureActivation(
    bool* aResult) {
  // The prompt does not set requiresUserInput, so this is never consulted.
  // Computing it from a parent-side WindowGlobalParent would assert
  // IsInProcess() and crash, so simply report false.
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetIsRequestDelegatedToUnsafeThirdParty(
    bool* aResult) {
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::GetIgnoreAllowSitePermission(
    bool* aResult) {
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::NotifyShown() { return NS_OK; }

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::Cancel() {
  Resolve(false);
  return NS_OK;
}

NS_IMETHODIMP
SpeechModelDownloadPermissionRequest::Allow(JS::Handle<JS::Value> aChoices) {
  Resolve(true);
  return NS_OK;
}

void ShowSpeechModelDownloadConsent(const SpeechModelIdentifier& aModel,
                                    CanonicalBrowsingContext* aBrowsingContext,
                                    const nsString& aProgressToken,
                                    std::function<void(bool)>&& aResolver) {
  // Testing shortcut: decide from media.navigator.permission.disabled without
  // showing UI.
  if (Preferences::GetBool(
          "media.webspeech.recognition.model-download.prompt.testing", false)) {
    aResolver(
        Preferences::GetBool("media.navigator.permission.disabled", false));
    return;
  }

  WindowGlobalParent* wgp = aBrowsingContext->GetCurrentWindowGlobal();
  CanonicalBrowsingContext* top = aBrowsingContext->Top();
  WindowGlobalParent* topWgp = top->GetCurrentWindowGlobal();
  RefPtr<Element> element = top->GetEmbedderElement();
  if (!wgp || !element) {
    aResolver(false);
    return;
  }
  nsCOMPtr<nsIPrincipal> principal = wgp->DocumentPrincipal();
  nsCOMPtr<nsIPrincipal> topPrincipal =
      topWgp ? topWgp->DocumentPrincipal() : principal.get();
  if (!principal) {
    aResolver(false);
    return;
  }

  auto request = MakeRefPtr<SpeechModelDownloadPermissionRequest>(
      principal, topPrincipal, element, aModel, aProgressToken,
      std::move(aResolver));
  if (NS_FAILED(nsContentPermissionUtils::AskPermission(request, nullptr))) {
    request->Resolve(false);
  }
}

}  // namespace mozilla::dom
