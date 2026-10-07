/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/LoadedOriginSet.h"

#include "mozilla/dom/RemoteType.h"
#include "nsIPrincipal.h"

namespace mozilla::dom {

LoadedOriginSet::LoadedOriginSet(const RemoteType& aRemoteType)
    : mRemoteType(aRemoteType) {}

RemoteType LoadedOriginSet::GetRemoteType() {
  MutexAutoLock lock(mMutex);
  return mRemoteType;
}

void LoadedOriginSet::SetRemoteType(const RemoteType& aRemoteType) {
  MutexAutoLock lock(mMutex);
  MOZ_ASSERT(mRemoteType.IsPrealloc());
  mRemoteType = aRemoteType;
}

bool LoadedOriginSet::Has(nsIPrincipal* aPrincipal, Level aThreshold,
                          uint32_t aStripAttributesFlags) {
  if (aThreshold == Level::Unloaded) {
    return true;
  }

  const OriginAttributes& attrs = aPrincipal->OriginAttributesRef();
  nsAutoCString originNoSuffix;
  if (aThreshold <= Level::SiteOnly) {
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

bool LoadedOriginSet::AddInternal(nsIPrincipal* aPrincipal, bool aTentative) {
  nsAutoCString originNoSuffix;
  MOZ_ALWAYS_SUCCEEDS(aPrincipal->GetOriginNoSuffix(originNoSuffix));
  nsAutoCString siteOriginNoSuffix;
  MOZ_ALWAYS_SUCCEEDS(aPrincipal->GetSiteOriginNoSuffix(siteOriginNoSuffix));

  nsAutoCString precursorSiteOriginNoSuffix;
  nsCOMPtr<nsIPrincipal> precursor = aPrincipal->GetPrecursorPrincipal();
  if (precursor) {
    MOZ_ALWAYS_SUCCEEDS(
        precursor->GetSiteOriginNoSuffix(precursorSiteOriginNoSuffix));
  }

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

  if (precursor) {
    OriginEntry& precursorEntry =
        found->mOrigins.LookupOrInsert(precursorSiteOriginNoSuffix);
    precursorEntry.mLevel =
        std::max(precursorEntry.mLevel, Level::PrecursorOnly);
  }

  if (siteOriginNoSuffix != originNoSuffix) {
    OriginEntry& siteEntry = found->mOrigins.LookupOrInsert(siteOriginNoSuffix);
    siteEntry.mLevel = std::max(siteEntry.mLevel, Level::SiteOnly);
  }

  OriginEntry& originEntry = found->mOrigins.LookupOrInsert(originNoSuffix);

  Level newLevel = aTentative ? Level::Tentative : Level::Full;
  if (originEntry.mLevel < newLevel) {
    originEntry.mLevel = newLevel;
    return true;
  }
  return false;
}

bool LoadedOriginSet::ValidatePrincipal(
    nsIPrincipal* aPrincipal,
    const EnumSet<ValidatePrincipalOptions>& aOptions) {
  return ValidatePrincipalCouldPotentiallyBeLoadedBy(
      aPrincipal, GetRemoteType(), aOptions, this);
}

}  // namespace mozilla::dom
