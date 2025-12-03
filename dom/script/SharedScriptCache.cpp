/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SharedScriptCache.h"

#include "ScriptLoadHandler.h"  // ScriptLoadHandler
#include "ScriptLoader.h"       // ScriptLoader
#include "js/experimental/CompileScript.h"  // JS::FrontendContext, JS::NewFrontendContext, JS::DestroyFrontendContext
#include "mozilla/Maybe.h"              // Maybe, Some, Nothing
#include "mozilla/dom/ContentParent.h"  // dom::ContentParent
#include "nsIMemoryReporter.h"  // nsIMemoryReporter, MOZ_DEFINE_MALLOC_SIZE_OF, RegisterWeakMemoryReporter, UnregisterWeakMemoryReporter, MOZ_COLLECT_REPORT, KIND_HEAP, UNITS_BYTES
#include "nsIPrefBranch.h"   // nsIPrefBranch, NS_PREFBRANCH_PREFCHANGE_TOPIC_ID
#include "nsIPrefService.h"  // NS_PREFSERVICE_CONTRACTID
#include "nsIPrincipal.h"    // nsIPrincipal
#include "nsISupportsImpl.h"  // NS_IMPL_ISUPPORTS
#include "nsStringFwd.h"      // nsACString

namespace mozilla::dom {

ScriptHashKey::ScriptHashKey(
    ScriptLoader* aLoader, const JS::loader::ScriptLoadRequest* aRequest,
    const JS::loader::ScriptFetchOptions* aFetchOptions,
    const nsCOMPtr<nsIURI> aURI)
    : PLDHashEntryHdr(),
      mKind(aRequest->mKind),
      mCORSMode(aFetchOptions->mCORSMode),
      mIsLinkRelPreload(aRequest->GetScriptLoadContext()->IsPreload()),
      mURI(aURI),
      mLoaderPrincipal(aLoader->LoaderPrincipal()),
      mPartitionPrincipal(aLoader->PartitionedPrincipal()),
      mSRIMetadata(aRequest->mIntegrity),
      mNonce(aFetchOptions->mNonce) {
  if (mKind == JS::loader::ScriptKind::eClassic) {
    if (aRequest->GetScriptLoadContext()->HasScriptElement()) {
      aRequest->GetScriptLoadContext()->GetHintCharset(mHintCharset);
    }
  }

  MOZ_COUNT_CTOR(ScriptHashKey);
}

ScriptHashKey::ScriptHashKey(ScriptLoader* aLoader,
                             const JS::loader::ScriptLoadRequest* aRequest,
                             const JS::loader::LoadedScript* aLoadedScript)
    : ScriptHashKey(aLoader, aRequest, aLoadedScript->GetFetchOptions(),
                    aLoadedScript->GetURI()) {}

ScriptHashKey::ScriptHashKey(const ScriptLoadData& aLoadData)
    : ScriptHashKey(aLoadData.CacheKey()) {}

bool ScriptHashKey::KeyEquals(const ScriptHashKey& aKey) const {
  if (mKind != aKey.mKind) {
    return false;
  }

  {
    bool eq;
    if (NS_FAILED(mURI->Equals(aKey.mURI, &eq)) || !eq) {
      return false;
    }
  }

  if (!mPartitionPrincipal->Equals(aKey.mPartitionPrincipal)) {
    return false;
  }

  if (mCORSMode != aKey.mCORSMode) {
    return false;
  }

  if (mNonce != aKey.mNonce) {
    return false;
  }

  // NOTE: module always use UTF-8.
  if (mKind == JS::loader::ScriptKind::eClassic) {
    if (mHintCharset != aKey.mHintCharset) {
      return false;
    }
  }

  if (!mSRIMetadata.CanTrustBeDelegatedTo(aKey.mSRIMetadata) ||
      !aKey.mSRIMetadata.CanTrustBeDelegatedTo(mSRIMetadata)) {
    return false;
  }

  return true;
}

NS_IMPL_ISUPPORTS(ScriptLoadData, nsISupports)

ScriptLoadData::ScriptLoadData(ScriptLoader* aLoader,
                               JS::loader::ScriptLoadRequest* aRequest,
                               JS::loader::LoadedScript* aLoadedScript)
    : mExpirationTime(aRequest->ExpirationTime()),
      mLoader(aLoader),
      mKey(aLoader, aRequest, aLoadedScript),
      mLoadedScript(aLoadedScript),
      mNetworkMetadata(aRequest->mNetworkMetadata) {}

NS_IMPL_ISUPPORTS(SharedScriptCache, nsIMemoryReporter)

MOZ_DEFINE_MALLOC_SIZE_OF(SharedScriptCacheMallocSizeOf)

SharedScriptCache::SharedScriptCache() = default;

void SharedScriptCache::Init() {
  RegisterWeakMemoryReporter(this);

  // URL classification (tracking protection etc) are handled inside
  // nsHttpChannel.
  // The cache reflects the policy for whether to block or not, and once
  // the policy is modified, we should discard the cache, to avoid running
  // a cached script which is supposed to be blocked.
  auto ClearCache = [](const char*, void*) { Clear(); };
  Preferences::RegisterPrefixCallback(ClearCache, "urlclassifier.");
  Preferences::RegisterCallback(ClearCache,
                                "privacy.trackingprotection.enabled");
}

SharedScriptCache::~SharedScriptCache() { UnregisterWeakMemoryReporter(this); }

void SharedScriptCache::LoadCompleted(SharedScriptCache* aCache,
                                      ScriptLoadData& aData) {}

NS_IMETHODIMP
SharedScriptCache::CollectReports(nsIHandleReportCallback* aHandleReport,
                                  nsISupports* aData, bool aAnonymize) {
  MOZ_COLLECT_REPORT("explicit/js-non-window/cache", KIND_HEAP, UNITS_BYTES,
                     SharedScriptCacheMallocSizeOf(this) +
                         SizeOfExcludingThis(SharedScriptCacheMallocSizeOf),
                     "Memory used for SharedScriptCache to share script "
                     "across documents");
  return NS_OK;
}

void SharedScriptCache::Clear(const Maybe<bool>& aChrome,
                              const Maybe<nsCOMPtr<nsIPrincipal>>& aPrincipal,
                              const Maybe<nsCString>& aSchemelessSite,
                              const Maybe<OriginAttributesPattern>& aPattern,
                              const Maybe<nsCString>& aURL) {
  using ContentParent = dom::ContentParent;

  if (XRE_IsParentProcess()) {
    for (auto* cp : ContentParent::AllProcesses(ContentParent::eLive)) {
      (void)cp->SendClearScriptCache(aChrome, aPrincipal, aSchemelessSite,
                                     aPattern, aURL);
    }
  }

  if (sSingleton) {
    sSingleton->ClearInProcess(aChrome, aPrincipal, aSchemelessSite, aPattern,
                               aURL);
  }
}

/* static */
void SharedScriptCache::PrepareForLastCC() {
  if (sSingleton) {
    sSingleton->mComplete.Clear();
    sSingleton->mPending.Clear();
    sSingleton->mLoading.Clear();
  }
}

static bool ShouldSave(JS::loader::LoadedScript* aLoadedScript,
                       ScriptLoader::DiskCacheStrategy aStrategy) {
  if (!aLoadedScript->HasDiskCacheReference()) {
    return false;
  }

  if (!aLoadedScript->HasSRI()) {
    return false;
  }

  if (aStrategy.mHasSourceLengthMin) {
    size_t len = JS::GetScriptSourceLength(aLoadedScript->GetStencil());
    if (len < aStrategy.mSourceLengthMin) {
      return false;
    }
  }

  if (aStrategy.mHasFetchCountMin) {
    if (aLoadedScript->mFetchCount < aStrategy.mFetchCountMin) {
      return false;
    }
  }

  return true;
}

bool SharedScriptCache::MaybeScheduleUpdateDiskCache() {
  auto strategy = ScriptLoader::GetDiskCacheStrategy();
  if (strategy.mIsDisabled) {
    return false;
  }

  bool hasSaveable = false;
  for (auto iter = mComplete.Iter(); !iter.Done(); iter.Next()) {
    JS::loader::LoadedScript* loadedScript = iter.Data().mResource;
    if (ShouldSave(loadedScript, strategy)) {
      hasSaveable = true;
      break;
    }
  }

  if (!hasSaveable) {
    return false;
  }

  // TODO: Apply more flexible scheduling (bug 1902951)

  nsCOMPtr<nsIRunnable> updater =
      NewRunnableMethod("SharedScriptCache::UpdateDiskCache", this,
                        &SharedScriptCache::UpdateDiskCache);
  (void)NS_DispatchToCurrentThreadQueue(updater.forget(),
                                        EventQueuePriority::Idle);
  return true;
}

void SharedScriptCache::UpdateDiskCache() {
  auto strategy = ScriptLoader::GetDiskCacheStrategy();
  if (strategy.mIsDisabled) {
    return;
  }

  JS::FrontendContext* fc = nullptr;

  for (auto iter = mComplete.Iter(); !iter.Done(); iter.Next()) {
    JS::loader::LoadedScript* loadedScript = iter.Data().mResource;
    if (!ShouldSave(loadedScript, strategy)) {
      continue;
    }

    if (!fc) {
      // Lazily create the context only when there's at least one script
      // that needs to be saved.
      fc = JS::NewFrontendContext();
      if (!fc) {
        return;
      }
    }

    ScriptLoader::EncodeBytecodeAndSave(fc, loadedScript);

    loadedScript->DropDiskCacheReference();
    loadedScript->DropBytecode();
  }

  if (fc) {
    JS::DestroyFrontendContext(fc);
  }
}

}  // namespace mozilla::dom
