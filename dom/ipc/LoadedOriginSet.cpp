/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/LoadedOriginSet.h"

#include "mozilla/dom/RemoteType.h"
#include "nsIPrincipal.h"

namespace mozilla::dom {

LoadedOriginSet::LoadedOriginSet(const nsACString& aRemoteType)
    : mRemoteType(aRemoteType) {}

nsCString LoadedOriginSet::GetRemoteType() {
  MutexAutoLock lock(mMutex);
  return mRemoteType;
}

void LoadedOriginSet::SetRemoteType(const nsACString& aRemoteType) {
  MutexAutoLock lock(mMutex);
  MOZ_ASSERT(mRemoteType == PREALLOC_REMOTE_TYPE);
  mRemoteType = aRemoteType;
}

bool LoadedOriginSet::Has(nsIPrincipal* aPrincipal, Level aThreshold,
                          uint32_t aStripAttributesFlags) {
  if (aThreshold == Level::Unloaded) {
    return true;
  }

  const OriginAttributes& attrs = aPrincipal->OriginAttributesRef();
  nsAutoCString originNoSuffix;
  if (aThreshold == Level::SiteOnly) {
    MOZ_ALWAYS_SUCCEEDS(aPrincipal->GetSiteOriginNoSuffix(originNoSuffix));
  } else {
    MOZ_ALWAYS_SUCCEEDS(aPrincipal->GetOriginNoSuffix(originNoSuffix));
  }

  MutexAutoLock lock(mMutex);

  for (const auto& loadedAttrs : mLoadedOrigins) {
    if (loadedAttrs.mAttrs.EqualsIgnoring(attrs, aStripAttributesFlags)) {
      if (auto entry = loadedAttrs.mOrigins.Lookup(originNoSuffix);
          entry && entry.Data().mLevel >= aThreshold) {
        return true;
      }
    }
  }
  return false;
}

LoadedOriginSet::Level LoadedOriginSet::AddInternal(nsIPrincipal* aPrincipal,
                                                    bool aTentative) {
  nsAutoCString originNoSuffix;
  MOZ_ALWAYS_SUCCEEDS(aPrincipal->GetOriginNoSuffix(originNoSuffix));
  nsAutoCString siteOriginNoSuffix;
  MOZ_ALWAYS_SUCCEEDS(aPrincipal->GetSiteOriginNoSuffix(siteOriginNoSuffix));

  MutexAutoLock lock(mMutex);

  AttributeBucket* found = nullptr;
  for (auto& entry : mLoadedOrigins) {
    if (entry.mAttrs == aPrincipal->OriginAttributesRef()) {
      found = &entry;
      break;
    }
  }
  if (!found) {
    found = mLoadedOrigins.AppendElement(
        AttributeBucket{.mAttrs = aPrincipal->OriginAttributesRef()});
  }

  Level previous = Level::Unloaded;

  if (siteOriginNoSuffix != originNoSuffix) {
    OriginEntry& siteEntry = found->mOrigins.LookupOrInsert(siteOriginNoSuffix);
    previous = std::min(siteEntry.mLevel, Level::SiteOnly);
    siteEntry.mLevel = std::max(siteEntry.mLevel, Level::SiteOnly);
  }

  OriginEntry& originEntry = found->mOrigins.LookupOrInsert(originNoSuffix);
  previous = std::max(previous, originEntry.mLevel);
  originEntry.mLevel =
      std::max(originEntry.mLevel, aTentative ? Level::Tentative : Level::Full);

  return previous;
}

bool LoadedOriginSet::ValidatePrincipal(
    nsIPrincipal* aPrincipal,
    const EnumSet<ValidatePrincipalOptions>& aOptions) {
  nsCString remoteType = GetRemoteType();
  auto isPrincipalLoaded = [&](nsIPrincipal* prin) {
    // FIXME: Currently we only match site, and ignore OAs. This is consistent
    // with ValidatePrincipal behaviour prior to bug 2055554. In the future, we
    // hope to tighten these checks.
    return !StaticPrefs::dom_ipc_validatePrincipal_validateSiteLoaded() ||
           Has(prin, Level::SiteOnly, OriginAttributes::STRIP_ALL);
  };
  return ValidatePrincipalCouldPotentiallyBeLoadedBy(
      aPrincipal, remoteType, aOptions, isPrincipalLoaded);
}

}  // namespace mozilla::dom
