/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WorkerLoadContext.h"

#include "CacheLoadHandler.h"  // CacheCreator
#include "js/loader/ScriptLoadRequest.h"
#include "mozilla/dom/workerinternals/ScriptLoader.h"

namespace mozilla {
namespace dom {

WorkerLoadContext::WorkerLoadContext(
    Kind aKind, const Maybe<ClientInfo>& aClientInfo,
    workerinternals::loader::WorkerScriptLoader* aScriptLoader,
    bool aOnlyExistingCachedResourcesAllowed)
    : JS::loader::LoadContextBase(JS::loader::ContextKind::Worker),
      mKind(aKind),
      mClientInfo(aClientInfo),
      mScriptLoader(aScriptLoader),
      mOnlyExistingCachedResourcesAllowed(aOnlyExistingCachedResourcesAllowed) {
      };

bool WorkerLoadContext::IsTopLevel() {
  return mRequest->IsTopLevel() && (mKind == Kind::MainScript);
};

ThreadSafeRequestHandle::ThreadSafeRequestHandle(
    JS::loader::ScriptLoadRequest* aRequest, nsISerialEventTarget* aSyncTarget)
    : mRequest(aRequest), mOwningEventTarget(aSyncTarget) {}

WorkerLoadContext* ThreadSafeRequestHandle::GetContext() {
  AssertRequestNotHandedOff();
  return mRequest->GetWorkerLoadContext();
}

bool ThreadSafeRequestHandle::ExecutionScheduled() const {
  AssertIsOnMainThread();
  return mExecutionScheduled;
}

void ThreadSafeRequestHandle::SetExecutionScheduled() {
  AssertIsOnMainThread();
  mExecutionScheduled = true;
}

void ThreadSafeRequestHandle::SetRunnable(
    workerinternals::loader::ScriptLoaderRunnable* aRunnable) {
  MutexAutoLock lock(mMutex);
  mRunnable = aRunnable;
}

already_AddRefed<JS::loader::ScriptLoadRequest>
ThreadSafeRequestHandle::ReleaseRequest() {
  RefPtr<JS::loader::ScriptLoadRequest> request;
  RefPtr<workerinternals::loader::ScriptLoaderRunnable> runnable;
  {
    MutexAutoLock lock(mMutex);
    mRequest.swap(request);
    mRunnable.swap(runnable);
  }
  // Drop the last reference to the runnable, if any, outside of the lock so it
  // is never destroyed while mMutex is held.
  return request.forget();
}

nsresult ThreadSafeRequestHandle::OnStreamComplete(nsresult aStatus) {
  RefPtr<workerinternals::loader::ScriptLoaderRunnable> runnable;
  {
    MutexAutoLock lock(mMutex);
    runnable = mRunnable;
  }
  if (!runnable) {
    return NS_OK;
  }
  return runnable->OnStreamComplete(this, aStatus);
}

void ThreadSafeRequestHandle::LoadingFinished(nsresult aRv) {
  RefPtr<workerinternals::loader::ScriptLoaderRunnable> runnable;
  {
    MutexAutoLock lock(mMutex);
    runnable = mRunnable;
  }
  if (!runnable) {
    return;
  }
  runnable->LoadingFinished(this, aRv);
}

void ThreadSafeRequestHandle::MaybeExecuteFinishedScripts() {
  RefPtr<workerinternals::loader::ScriptLoaderRunnable> runnable;
  {
    MutexAutoLock lock(mMutex);
    runnable = mRunnable;
  }
  if (!runnable) {
    return;
  }
  runnable->MaybeExecuteFinishedScripts(this);
}

bool ThreadSafeRequestHandle::IsCancelled() {
  RefPtr<workerinternals::loader::ScriptLoaderRunnable> runnable;
  {
    MutexAutoLock lock(mMutex);
    runnable = mRunnable;
  }
  return runnable && runnable->IsCancelled();
}

nsresult ThreadSafeRequestHandle::GetCancelResult() {
  RefPtr<workerinternals::loader::ScriptLoaderRunnable> runnable;
  {
    MutexAutoLock lock(mMutex);
    runnable = mRunnable;
  }
  return runnable ? runnable->GetCancelResult() : NS_OK;
}

already_AddRefed<workerinternals::loader::CacheCreator>
ThreadSafeRequestHandle::GetCacheCreator() {
  AssertIsOnMainThread();
  MutexAutoLock lock(mMutex);
  if (!mRunnable) {
    return nullptr;
  }
  // Return a strong reference so the CacheCreator stays alive for the caller
  // even if the runnable is released on the worker thread once we drop the
  // lock.
  RefPtr<workerinternals::loader::CacheCreator> cacheCreator =
      mRunnable->GetCacheCreator();
  return cacheCreator.forget();
}

ThreadSafeRequestHandle::~ThreadSafeRequestHandle() {
  // Nothing can be racing with us any more, but ReleaseRequest() may have
  // cleared mRequest on the worker thread, so take mMutex once to make sure we
  // observe that write rather than a stale pointer to an already freed request.
  bool hasRequest;
  {
    MutexAutoLock lock(mMutex);
    hasRequest = !!mRequest;
  }

  // Normally we only touch mStrongRef on the owning thread.  This is safe,
  // however, because when we do use mStrongRef on the owning thread we are
  // always holding a strong ref to the ThreadsafeHandle via the owning
  // runnable.  So we cannot run the ThreadsafeHandle destructor simultaneously.
  if (!hasRequest || mOwningEventTarget->IsOnCurrentThread()) {
    return;
  }

  // Dispatch in NS_ProxyRelease is guaranteed to succeed here because we block
  // shutdown until all Contexts have been destroyed. Therefore it is ok to have
  // MOZ_ALWAYS_SUCCEED here.
  MOZ_ALWAYS_SUCCEEDS(NS_ProxyRelease("ThreadSafeRequestHandle::mRequest",
                                      mOwningEventTarget, mRequest.forget()));
}

}  // namespace dom
}  // namespace mozilla
