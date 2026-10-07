/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PermissionsPolicy.h"

#include "mozilla/BasePrincipal.h"
#include "mozilla/StaticPrefs_dom.h"
#include "mozilla/dom/BrowsingContext.h"
#include "mozilla/dom/Feature.h"
#include "mozilla/dom/HTMLIFrameElement.h"
#include "mozilla/dom/PermissionsPolicyBinding.h"
#include "mozilla/dom/PermissionsPolicyParser.h"
#include "mozilla/dom/PermissionsPolicyUtils.h"
#include "nsContentUtils.h"
#include "nsNetUtil.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(PermissionsPolicy)
NS_IMPL_CYCLE_COLLECTING_ADDREF(PermissionsPolicy)
NS_IMPL_CYCLE_COLLECTING_RELEASE(PermissionsPolicy)

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(PermissionsPolicy)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

PermissionsPolicy::PermissionsPolicy(nsINode* aNode) : mParentNode(aNode) {}

void PermissionsPolicy::InheritPolicy(PermissionsPolicy* aParentPolicy) {
  MOZ_ASSERT(aParentPolicy);

  mInheritedDeniedFeatureNames.Clear();

  RefPtr<PermissionsPolicy> dest = this;
  RefPtr<PermissionsPolicy> src = aParentPolicy;

  // Inherit origins which explicitly declared policy in chain
  for (const Feature& featureInChain :
       aParentPolicy->mDeclaredFeaturesInAncestorChain) {
    dest->AppendToDeclaredAllowInAncestorChain(featureInChain);
  }

  PermissionsPolicyUtils::ForEachFeature([dest, src](const char* aFeatureName) {
    nsString featureName;
    featureName.AppendASCII(aFeatureName);
    // Store unsafe allows all (allow=*)
    if (src->HasFeatureUnsafeAllowsAll(featureName)) {
      dest->mParentAllowedAllFeatures.AppendElement(featureName);
    }

    // If the destination has a declared feature (via the HTTP header or 'allow'
    // attribute) we allow the feature if the destination allows it and the
    // parent allows its origin or the destinations' one.
    if (dest->HasDeclaredFeature(featureName) &&
        dest->AllowsFeatureInternal(featureName, dest->mDefaultOrigin)) {
      if (!src->AllowsFeatureInternal(featureName, src->mDefaultOrigin) &&
          !src->AllowsFeatureInternal(featureName, dest->mDefaultOrigin)) {
        dest->SetInheritedDeniedFeature(featureName);
      }
      return;
    }

    // If there was not a declared feature, we allow the feature if the parent
    // PermissionsPolicy allows the current origin.
    if (!src->AllowsFeatureInternal(featureName, dest->mDefaultOrigin)) {
      dest->SetInheritedDeniedFeature(featureName);
    }
  });
}

void PermissionsPolicy::InheritPolicy(
    const PermissionsPolicyInfo& aContainerPermissionsPolicyInfo) {
  // Create a temporary PermissionsPolicy from the PermissionsPolicyInfo to be
  // able to re-use the inheriting functionality.
  RefPtr<dom::PermissionsPolicy> permissionsPolicy =
      new dom::PermissionsPolicy(nullptr);
  permissionsPolicy->SetDefaultOrigin(
      aContainerPermissionsPolicyInfo.mDefaultOrigin);
  permissionsPolicy->SetInheritedDeniedFeatureNames(
      aContainerPermissionsPolicyInfo.mInheritedDeniedFeatureNames);

  const auto& declaredString = aContainerPermissionsPolicyInfo.mDeclaredString;
  if (aContainerPermissionsPolicyInfo.mSelfOrigin &&
      !declaredString.IsEmpty()) {
    permissionsPolicy->SetDeclaredAttributePolicy(
        nullptr, declaredString, aContainerPermissionsPolicyInfo.mSelfOrigin,
        aContainerPermissionsPolicyInfo.mSrcOrigin);
  }

  for (const auto& featureName :
       aContainerPermissionsPolicyInfo.mAttributeEnabledFeatureNames) {
    permissionsPolicy->MaybeSetAllowedPolicy(featureName);
  }

  InheritPolicy(permissionsPolicy);
}

void PermissionsPolicy::SetInheritedDeniedFeature(
    const nsAString& aFeatureName) {
  MOZ_ASSERT(!HasInheritedDeniedFeature(aFeatureName));
  mInheritedDeniedFeatureNames.AppendElement(aFeatureName);
}

bool PermissionsPolicy::HasInheritedDeniedFeature(
    const nsAString& aFeatureName) const {
  return mInheritedDeniedFeatureNames.Contains(aFeatureName);
}

bool PermissionsPolicy::HasDeclaredFeature(
    const nsAString& aFeatureName) const {
  for (const Feature& feature : mFeatures) {
    if (feature.Name().Equals(aFeatureName)) {
      return true;
    }
  }

  return false;
}

bool PermissionsPolicy::HasFeatureUnsafeAllowsAll(
    const nsAString& aFeatureName) const {
  for (const Feature& feature : mFeatures) {
    if (feature.AllowsAll() && feature.Name().Equals(aFeatureName)) {
      return true;
    }
  }

  // We should look into parent too (for example, document of iframe which
  // allows all, would be unsafe)
  return mParentAllowedAllFeatures.Contains(aFeatureName);
}

void PermissionsPolicy::AppendToDeclaredAllowInAncestorChain(
    const Feature& aFeature) {
  for (Feature& featureInChain : mDeclaredFeaturesInAncestorChain) {
    if (featureInChain.Name().Equals(aFeature.Name())) {
      MOZ_ASSERT(featureInChain.HasAllowList());

      nsTArray<nsCOMPtr<nsIPrincipal>> list;
      aFeature.GetAllowList(list);

      for (nsIPrincipal* principal : list) {
        featureInChain.AppendToAllowList(principal);
      }
      continue;
    }
  }

  mDeclaredFeaturesInAncestorChain.AppendElement(aFeature);
}

bool PermissionsPolicy::IsSameOriginAsSrc(nsIPrincipal* aPrincipal) const {
  MOZ_ASSERT(aPrincipal);

  if (!mSrcOrigin) {
    return false;
  }

  return BasePrincipal::Cast(mSrcOrigin)
      ->Subsumes(aPrincipal, BasePrincipal::ConsiderDocumentDomain);
}

void PermissionsPolicy::SetDeclaredAttributePolicy(
    Document* aDocument, const nsAString& aPolicyString,
    nsIPrincipal* aSelfOrigin, nsIPrincipal* aSrcOrigin) {
  ResetDeclaredPolicy();

  mDeclaredString = aPolicyString;
  mSelfOrigin = aSelfOrigin;
  mSrcOrigin = aSrcOrigin;

  (void)NS_WARN_IF(!PermissionsPolicyParser::ParsePolicyFromAttribute(
      aPolicyString, aDocument, aSelfOrigin, aSrcOrigin, mFeatures));

  // Only store explicitly declared allowlist
  for (const Feature& feature : mFeatures) {
    if (feature.HasAllowList()) {
      AppendToDeclaredAllowInAncestorChain(feature);
    }
  }
}

void PermissionsPolicy::SetDeclaredHeaderPolicy(Document* aDocument,
                                                const nsAString& aPolicyString,
                                                nsIPrincipal* aSelfOrigin) {
  ResetDeclaredPolicy();

  mDeclaredString = aPolicyString;
  mSelfOrigin = aSelfOrigin;

  (void)NS_WARN_IF(!PermissionsPolicyParser::ParsePolicyFromHeader(
      NS_ConvertUTF16toUTF8(aPolicyString), aDocument, aSelfOrigin, mFeatures));

  // Only store explicitly declared allowlist
  for (const Feature& feature : mFeatures) {
    if (feature.HasAllowList()) {
      AppendToDeclaredAllowInAncestorChain(feature);
    }
  }
}

void PermissionsPolicy::ResetDeclaredPolicy() {
  mFeatures.Clear();
  mDeclaredString.Truncate();
  mSelfOrigin = nullptr;
  mSrcOrigin = nullptr;
  mDeclaredFeaturesInAncestorChain.Clear();
  mAttributeEnabledFeatureNames.Clear();
}

JSObject* PermissionsPolicy::WrapObject(JSContext* aCx,
                                        JS::Handle<JSObject*> aGivenProto) {
  return PermissionsPolicy_Binding::Wrap(aCx, this, aGivenProto);
}

bool PermissionsPolicy::AllowsFeature(
    const nsAString& aFeatureName, const Optional<nsAString>& aOrigin) const {
  nsCOMPtr<nsIPrincipal> origin;
  if (aOrigin.WasPassed()) {
    nsCOMPtr<nsIURI> uri;
    nsresult rv = NS_NewURI(getter_AddRefs(uri), aOrigin.Value());
    if (NS_FAILED(rv)) {
      return false;
    }
    origin = BasePrincipal::CreateContentPrincipal(
        uri, BasePrincipal::Cast(mDefaultOrigin)->OriginAttributesRef());
  } else {
    origin = mDefaultOrigin;
  }

  if (NS_WARN_IF(!origin)) {
    return false;
  }

  return AllowsFeatureInternal(aFeatureName, origin);
}

bool PermissionsPolicy::AllowsFeatureExplicitlyInAncestorChain(
    const nsAString& aFeatureName, nsIPrincipal* aOrigin) const {
  MOZ_ASSERT(aOrigin);

  for (const Feature& feature : mDeclaredFeaturesInAncestorChain) {
    if (feature.Name().Equals(aFeatureName)) {
      return feature.AllowListContains(aOrigin);
    }
  }

  return false;
}

bool PermissionsPolicy::AllowsFeatureInternal(const nsAString& aFeatureName,
                                              nsIPrincipal* aOrigin) const {
  MOZ_ASSERT(aOrigin);

  // Let's see if have to disable this feature because inherited policy.
  if (HasInheritedDeniedFeature(aFeatureName)) {
    return false;
  }

  for (const Feature& feature : mFeatures) {
    if (feature.Name().Equals(aFeatureName)) {
      return feature.Allows(aOrigin);
    }
  }

  switch (PermissionsPolicyUtils::DefaultAllowListFeature(aFeatureName)) {
    case PermissionsPolicyUtils::PermissionsPolicyValue::eAll:
      return true;

    case PermissionsPolicyUtils::PermissionsPolicyValue::eSelf:
      return BasePrincipal::Cast(mDefaultOrigin)
          ->Subsumes(aOrigin, BasePrincipal::ConsiderDocumentDomain);

    case PermissionsPolicyUtils::PermissionsPolicyValue::eNone:
      return false;

    default:
      MOZ_CRASH("Unknown default value");
  }

  return false;
}

void PermissionsPolicy::Features(nsTArray<nsString>& aFeatures) {
  RefPtr<PermissionsPolicy> self = this;
  PermissionsPolicyUtils::ForEachFeature(
      [self, &aFeatures](const char* aFeatureName) {
        nsString featureName;
        featureName.AppendASCII(aFeatureName);
        aFeatures.AppendElement(featureName);
      });
}

void PermissionsPolicy::AllowedFeatures(nsTArray<nsString>& aAllowedFeatures) {
  RefPtr<PermissionsPolicy> self = this;
  PermissionsPolicyUtils::ForEachFeature(
      [self, &aAllowedFeatures](const char* aFeatureName) {
        nsString featureName;
        featureName.AppendASCII(aFeatureName);

        if (self->AllowsFeatureInternal(featureName, self->mDefaultOrigin)) {
          aAllowedFeatures.AppendElement(featureName);
        }
      });
}

void PermissionsPolicy::GetAllowlistForFeature(
    const nsAString& aFeatureName, nsTArray<nsString>& aList) const {
  if (!AllowsFeatureInternal(aFeatureName, mDefaultOrigin)) {
    return;
  }

  for (const Feature& feature : mFeatures) {
    if (feature.Name().Equals(aFeatureName)) {
      if (feature.AllowsAll()) {
        aList.AppendElement(u"*"_ns);
        return;
      }

      nsTArray<nsCOMPtr<nsIPrincipal>> list;
      feature.GetAllowList(list);

      for (nsIPrincipal* principal : list) {
        nsAutoCString originNoSuffix;
        nsresult rv = principal->GetOriginNoSuffix(originNoSuffix);
        if (NS_WARN_IF(NS_FAILED(rv))) {
          return;
        }

        aList.AppendElement(NS_ConvertUTF8toUTF16(originNoSuffix));
      }
      return;
    }
  }

  switch (PermissionsPolicyUtils::DefaultAllowListFeature(aFeatureName)) {
    case PermissionsPolicyUtils::PermissionsPolicyValue::eAll:
      aList.AppendElement(u"*"_ns);
      return;

    case PermissionsPolicyUtils::PermissionsPolicyValue::eSelf: {
      nsAutoCString originNoSuffix;
      nsresult rv = mDefaultOrigin->GetOriginNoSuffix(originNoSuffix);
      if (NS_WARN_IF(NS_FAILED(rv))) {
        return;
      }

      aList.AppendElement(NS_ConvertUTF8toUTF16(originNoSuffix));
      return;
    }

    case PermissionsPolicyUtils::PermissionsPolicyValue::eNone:
      return;

    default:
      MOZ_CRASH("Unknown default value");
  }
}

void PermissionsPolicy::MaybeSetAllowedPolicy(const nsAString& aFeatureName) {
  MOZ_ASSERT(PermissionsPolicyUtils::IsSupportedFeature(aFeatureName) ||
             PermissionsPolicyUtils::IsExperimentalFeature(aFeatureName));
  // Skip if feature is in experimental phase
  if (!StaticPrefs::dom_security_permissionsPolicy_experimental_enabled() &&
      PermissionsPolicyUtils::IsExperimentalFeature(aFeatureName)) {
    return;
  }

  if (HasDeclaredFeature(aFeatureName)) {
    return;
  }

  Feature feature(aFeatureName);
  feature.SetAllowsAll();

  mFeatures.AppendElement(feature);
  mAttributeEnabledFeatureNames.AppendElement(aFeatureName);
}

PermissionsPolicyInfo PermissionsPolicy::ToPermissionsPolicyInfo() const {
  return {mInheritedDeniedFeatureNames.Clone(),
          mAttributeEnabledFeatureNames.Clone(),
          mDeclaredString,
          mDefaultOrigin,
          mSelfOrigin,
          mSrcOrigin};
}

}  // namespace mozilla::dom
