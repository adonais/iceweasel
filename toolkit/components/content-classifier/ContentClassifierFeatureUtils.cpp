/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ContentClassifierFeatureUtils.h"

#include "mozilla/BasePrincipal.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/Components.h"
#include "mozilla/ContentClassifierEngine.h"
#include "mozilla/extensions/WebExtensionPolicy.h"
#include "mozilla/glean/GleanPings.h"
#include "mozilla/glean/NetwerkMetrics.h"
#include "mozilla/Services.h"
#include "mozilla/StaticPtr.h"
#include "nsAtom.h"
#include "nsIChannel.h"
#include "nsIEffectiveTLDService.h"
#include "nsILoadInfo.h"
#include "nsIObserverService.h"
#include "nsIURI.h"
#include "nsIWritablePropertyBag2.h"

namespace mozilla {

namespace {

class HarmfulAddonPingSender final : public nsIObserver {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIOBSERVER

  static void EnsureRegistered() {
    MOZ_ASSERT(NS_IsMainThread());
    if (sInstance) {
      return;
    }
    sInstance = new HarmfulAddonPingSender();
    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    if (obs) {
      obs->AddObserver(sInstance, "idle-daily", false);
    }
    ClearOnShutdown(&sInstance);
  }

 private:
  ~HarmfulAddonPingSender() = default;
  static StaticRefPtr<HarmfulAddonPingSender> sInstance;
};

StaticRefPtr<HarmfulAddonPingSender> HarmfulAddonPingSender::sInstance;

NS_IMPL_ISUPPORTS(HarmfulAddonPingSender, nsIObserver)

NS_IMETHODIMP HarmfulAddonPingSender::Observe(nsISupports*, const char* aTopic,
                                              const char16_t*) {
  if (!aTopic || strcmp(aTopic, "idle-daily") != 0) {
    return NS_OK;
  }
  glean_pings::UrlClassifierHarmfulAddon.Submit();
  return NS_OK;
}

}  // namespace

/* static */
bool ContentClassifierFeatureUtils::IsThirdPartyRequest(
    const ContentClassifierRequest& aRequest) {
  return aRequest.ThirdParty();
}

/* static */
bool ContentClassifierFeatureUtils::IsNonRecommendedAddonRequest(
    const ContentClassifierRequest& aRequest) {
  return aRequest.IsNonRecommendedAddon();
}

/* static */
extensions::WebExtensionPolicy*
ContentClassifierFeatureUtils::GetAddonPolicyFromLoadInfo(
    nsILoadInfo* aLoadInfo) {
  if (!aLoadInfo) {
    return nullptr;
  }
  nsCOMPtr<nsIPrincipal> triggeringPrincipal;
  if (NS_FAILED(aLoadInfo->GetTriggeringPrincipal(
          getter_AddRefs(triggeringPrincipal)))) {
    return nullptr;
  }
  nsCOMPtr<nsIPrincipal> loadingPrincipal;
  if (NS_FAILED(
          aLoadInfo->GetLoadingPrincipal(getter_AddRefs(loadingPrincipal)))) {
    return nullptr;
  }

  extensions::WebExtensionPolicy* policy = nullptr;
  if (triggeringPrincipal) {
    policy = BasePrincipal::Cast(triggeringPrincipal)->AddonPolicy();
    if (!policy) {
      policy =
          BasePrincipal::Cast(triggeringPrincipal)->ContentScriptAddonPolicy();
    }
  }
  if (!policy && loadingPrincipal) {
    policy = BasePrincipal::Cast(loadingPrincipal)->AddonPolicy();
    if (!policy) {
      policy =
          BasePrincipal::Cast(loadingPrincipal)->ContentScriptAddonPolicy();
    }
  }
  return policy;
}

/* static */
void ContentClassifierFeatureUtils::HarmfulAddonCancelChannelCallback(
    nsIChannel* aChannel) {
  MOZ_ASSERT(aChannel);
  HarmfulAddonPingSender::EnsureRegistered();

  nsCOMPtr<nsIURI> uri;
  if (NS_FAILED(aChannel->GetURI(getter_AddRefs(uri))) || !uri) {
    return;
  }

  nsCOMPtr<nsIEffectiveTLDService> etld = components::EffectiveTLD::Service();
  if (!etld) {
    return;
  }
  nsAutoCString etldStr;
  if (NS_FAILED(etld->GetBaseDomain(uri, 0, etldStr)) || etldStr.IsEmpty()) {
    return;
  }

  nsCOMPtr<nsILoadInfo> loadInfo = aChannel->LoadInfo();
  extensions::WebExtensionPolicy* policy = GetAddonPolicyFromLoadInfo(loadInfo);
  if (!policy) {
    return;
  }

  nsAutoCString addonId;
  CopyUTF16toUTF8(nsDependentAtomString(policy->Id()), addonId);
  nsAutoCString addonVersion;
  CopyUTF16toUTF8(policy->Version(), addonVersion);

  glean::network::urlclassifier_harmful_addon_block.Record(
      Some(glean::network::UrlclassifierHarmfulAddonBlockExtra{
          mozilla::Some(addonId), mozilla::Some(addonVersion),
          mozilla::Some(etldStr), mozilla::Nothing()}));

  nsAutoCString addonName;
  CopyUTF16toUTF8(policy->Name(), addonName);
  nsCOMPtr<nsIWritablePropertyBag2> props(do_QueryInterface(aChannel));
  if (props) {
    props->SetPropertyAsACString(u"blockedExtension"_ns, addonName);
  }
}

}  // namespace mozilla
