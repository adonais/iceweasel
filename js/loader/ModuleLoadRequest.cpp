/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ModuleLoadRequest.h"

#include "mozilla/DebugOnly.h"
#include "mozilla/HoldDropJSObjects.h"
#include "mozilla/dom/ScriptLoadContext.h"

#include "LoadedScript.h"
#include "LoadContextBase.h"
#include "ModuleLoaderBase.h"

namespace JS::loader {

#undef LOG
#define LOG(args)                                                           \
  MOZ_LOG(ModuleLoaderBase::gModuleLoaderBaseLog, mozilla::LogLevel::Debug, \
          args)

NS_IMPL_ISUPPORTS_CYCLE_COLLECTION_INHERITED_0(ModuleLoadRequest,
                                               ScriptLoadRequest)

NS_IMPL_CYCLE_COLLECTION_CLASS(ModuleLoadRequest)

NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN_INHERITED(ModuleLoadRequest,
                                                ScriptLoadRequest)
  tmp->mReferrerScript = nullptr;
  tmp->mModuleRequestObj = nullptr;
  tmp->mPayload.setUndefined();
  NS_IMPL_CYCLE_COLLECTION_UNLINK(mLoader, mRootModule, mModuleScript)
  tmp->ClearDynamicImport();
NS_IMPL_CYCLE_COLLECTION_UNLINK_END

NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN_INHERITED(ModuleLoadRequest,
                                                  ScriptLoadRequest)
  NS_IMPL_CYCLE_COLLECTION_TRAVERSE(mLoader, mRootModule, mModuleScript)
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTION_TRACE_BEGIN_INHERITED(ModuleLoadRequest,
                                               ScriptLoadRequest)
  NS_IMPL_CYCLE_COLLECTION_TRACE_JS_MEMBER_CALLBACK(mReferrerScript)
  NS_IMPL_CYCLE_COLLECTION_TRACE_JS_MEMBER_CALLBACK(mModuleRequestObj)
  NS_IMPL_CYCLE_COLLECTION_TRACE_JS_MEMBER_CALLBACK(mPayload)
NS_IMPL_CYCLE_COLLECTION_TRACE_END

ModuleLoadRequest::ModuleLoadRequest(
    nsIURI* aURI, ModuleType aModuleType,
    mozilla::dom::ReferrerPolicy aReferrerPolicy,
    ScriptFetchOptions* aFetchOptions,
    const mozilla::dom::SRIMetadata& aIntegrity, nsIURI* aReferrer,
    LoadContextBase* aContext, Kind aKind, ModuleLoaderBase* aLoader,
    ModuleLoadRequest* aRootModule)
    : ScriptLoadRequest(ScriptKind::eModule, aURI, aReferrerPolicy,
                        aFetchOptions, aIntegrity, aReferrer, aContext),
      mIsTopLevel(aKind == Kind::TopLevel || aKind == Kind::DynamicImport),
      mModuleType(aModuleType),
      mIsDynamicImport(aKind == Kind::DynamicImport),
      mLoader(aLoader),
      mRootModule(aRootModule) {
  MOZ_ASSERT(mLoader);
}

nsIGlobalObject* ModuleLoadRequest::GetGlobalObject() {
  return mLoader->GetGlobalObject();
}

bool ModuleLoadRequest::IsErrored() const {
  return !mModuleScript || mModuleScript->HasParseError();
}

void ModuleLoadRequest::Cancel() {
  if (IsCanceled()) {
    return;
  }

  if (IsFinished()) {
    return;
  }

  ScriptLoadRequest::Cancel();

  mModuleScript = nullptr;
  mReferrerScript = nullptr;
  mModuleRequestObj = nullptr;
}

void ModuleLoadRequest::SetReady() {
  MOZ_ASSERT(!IsFinished());

  // Mark a module as ready to execute. This means that this module and all it
  // dependencies have had their source loaded, parsed as a module and the
  // modules instantiated.

  ScriptLoadRequest::SetReady();
}

void ModuleLoadRequest::ModuleLoaded() {
  // A module that was found to be marked as fetching in the module map has now
  // been loaded.

  LOG(("ScriptLoadRequest (%p): Module loaded", this));

  if (IsCanceled()) {
    return;
  }

  MOZ_ASSERT(IsFetching() || IsPendingFetchingError());

  mModuleScript = mLoader->GetFetchedModule(ModuleMapKey(mURI, mModuleType));
  if (IsErrored()) {
    ModuleErrored();
    return;
  }
}

void ModuleLoadRequest::LoadFailed() {
  // We failed to load the source text or an error occurred unrelated to the
  // content of the module (e.g. OOM).

  LOG(("ScriptLoadRequest (%p): Module load failed", this));

  if (IsCanceled()) {
    return;
  }

  MOZ_ASSERT(IsFetching() || IsPendingFetchingError());
  MOZ_ASSERT(!mModuleScript);

  Cancel();
  LoadFinished();
}

void ModuleLoadRequest::ModuleErrored() {
  // Parse error, failure to resolve imported modules or error loading import.

  LOG(("ScriptLoadRequest (%p): Module errored", this));

  if (IsCanceled()) {
    return;
  }

  MOZ_ASSERT(!IsFinished());

  mozilla::DebugOnly<bool> hasRethrow =
      mModuleScript && mModuleScript->HasErrorToRethrow();

  // When LoadRequestedModules fails, we will set error to rethrow to the module
  // script and call ModuleErrored().
  MOZ_ASSERT(IsErrored() || hasRethrow);

  if (IsFinished()) {
    // Cancelling an outstanding import will error this request.
    return;
  }

  SetReady();
  LoadFinished();
}

void ModuleLoadRequest::LoadFinished() {
  RefPtr<ModuleLoadRequest> request(this);
  if (IsTopLevel() && IsDynamicImport()) {
    mLoader->RemoveDynamicImport(request);
  }

  mLoader->OnModuleLoadComplete(request);
}

void ModuleLoadRequest::SetDynamicImport(LoadedScript* aReferencingScript,
                                         Handle<JSObject*> aModuleRequestObj,
                                         Handle<JSObject*> aPromise) {
  MOZ_ASSERT(mPayload.isUndefined());

  mModuleRequestObj = aModuleRequestObj;
  mPayload = ObjectValue(*aPromise);

  mozilla::HoldJSObjects(this);
}

void ModuleLoadRequest::ClearDynamicImport() {
  mModuleRequestObj = nullptr;
  mPayload = UndefinedValue();
}

}  // namespace JS::loader
