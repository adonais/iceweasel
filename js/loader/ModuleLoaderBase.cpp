/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GeckoProfiler.h"
#include "LoadedScript.h"
#include "ModuleLoadRequest.h"
#include "ScriptLoadRequest.h"
#include "mozilla/dom/ScriptSettings.h"  // AutoJSAPI
#include "mozilla/dom/ScriptTrace.h"

#include "js/Array.h"  // JS::GetArrayLength
#include "js/CompilationAndEvaluation.h"
#include "js/ColumnNumber.h"          // JS::ColumnNumberOneOrigin
#include "js/ContextOptions.h"        // JS::ContextOptionsRef
#include "js/ErrorReport.h"           // JSErrorBase
#include "js/friend/ErrorMessages.h"  // js::GetErrorMessage, JSMSG_*
#include "js/friend/StackLimits.h"    // js::AutoCheckRecursionLimit
#include "js/Modules.h"  // JS::FinishLoadingImportedModule, JS::{G,S}etModuleResolveHook, JS::Get{ModulePrivate,ModuleScript,RequestedModule{s,Specifier,SourcePos}}, JS::SetModule{Load,Metadata}Hook
#include "js/PropertyAndElement.h"  // JS_DefineProperty, JS_GetElement
#include "js/SourceText.h"
#include "mozilla/Assertions.h"  // MOZ_ASSERT
#include "mozilla/BasePrincipal.h"
#include "mozilla/dom/AutoEntryScript.h"
#include "mozilla/dom/ScriptLoadContext.h"
#include "mozilla/CycleCollectedJSContext.h"  // nsAutoMicroTask
#include "mozilla/Preferences.h"
#include "mozilla/RefPtr.h"  // mozilla::StaticRefPtr
#include "mozilla/StaticPrefs_dom.h"
#include "nsContentUtils.h"
#include "nsICacheInfoChannel.h"  // nsICacheInfoChannel
#include "nsNetUtil.h"            // NS_NewURI
#include "xpcpublic.h"

using mozilla::AutoSlowOperation;
using mozilla::CycleCollectedJSContext;
using mozilla::Err;
using mozilla::MicroTaskRunnable;
using mozilla::Preferences;
using mozilla::UniquePtr;
using mozilla::WrapNotNull;
using mozilla::dom::AutoJSAPI;

namespace JS::loader {

mozilla::LazyLogModule ModuleLoaderBase::gCspPRLog("CSP");
mozilla::LazyLogModule ModuleLoaderBase::gModuleLoaderBaseLog(
    "ModuleLoaderBase");

#undef LOG
#define LOG(args)                                                           \
  MOZ_LOG(ModuleLoaderBase::gModuleLoaderBaseLog, mozilla::LogLevel::Debug, \
          args)

#define LOG_ENABLED() \
  MOZ_LOG_TEST(ModuleLoaderBase::gModuleLoaderBaseLog, mozilla::LogLevel::Debug)

//////////////////////////////////////////////////////////////
// ModuleLoaderBase::LoadingRequest
//////////////////////////////////////////////////////////////

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(ModuleLoaderBase::LoadingRequest)
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTION(ModuleLoaderBase::LoadingRequest, mRequest, mWaiting)

NS_IMPL_CYCLE_COLLECTING_ADDREF(ModuleLoaderBase::LoadingRequest)
NS_IMPL_CYCLE_COLLECTING_RELEASE(ModuleLoaderBase::LoadingRequest)

//////////////////////////////////////////////////////////////
// ModuleLoaderBase
//////////////////////////////////////////////////////////////

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(ModuleLoaderBase)
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

NS_IMPL_CYCLE_COLLECTION(ModuleLoaderBase, mFetchingModules, mFetchedModules,
                         mDynamicImportRequests, mGlobalObject, mOverriddenBy,
                         mLoader)

NS_IMPL_CYCLE_COLLECTING_ADDREF(ModuleLoaderBase)
NS_IMPL_CYCLE_COLLECTING_RELEASE(ModuleLoaderBase)

// static
void ModuleLoaderBase::EnsureModuleHooksInitialized() {
  AutoJSAPI jsapi;
  jsapi.Init();
  JSRuntime* rt = JS_GetRuntime(jsapi.cx());
  if (GetModuleLoadHook(rt)) {
    return;
  }

  SetModuleLoadHook(rt, HostLoadImportedModule);
  SetModuleMetadataHook(rt, HostPopulateImportMeta);
  SetScriptPrivateReferenceHooks(rt, HostAddRefTopLevelScript,
                                 HostReleaseTopLevelScript);
}

static bool ModuleTypeAllowed(ModuleType aModuleType) {
  return aModuleType != ModuleType::Unknown;
}

static bool CreateBadModuleTypeError(JSContext* aCx, LoadedScript* aScript,
                                     nsIURI* aURI,
                                     MutableHandle<Value> aErrorOut) {
  Rooted<JSString*> filename(aCx);
  if (aScript) {
    nsAutoCString url;
    aScript->BaseURL()->GetAsciiSpec(url);
    filename = JS_NewStringCopyZ(aCx, url.get());
  } else {
    filename = JS_NewStringCopyZ(aCx, "(unknown)");
  }

  if (!filename) {
    return false;
  }

  MOZ_ASSERT(aURI);
  nsAutoCString url;
  aURI->GetSpec(url);

  Rooted<JSString*> uri(aCx, JS_NewStringCopyZ(aCx, url.get()));
  if (!uri) {
    return false;
  }

  Rooted<JSString*> msg(aCx, JS_NewStringCopyZ(aCx, ": invalid module type"));
  if (!msg) {
    return false;
  }

  Rooted<JSString*> errMsg(aCx, JS_ConcatStrings(aCx, uri, msg));
  if (!errMsg) {
    return false;
  }

  return CreateError(aCx, JSEXN_TYPEERR, nullptr, filename, 0,
                     ColumnNumberOneOrigin(), nullptr, errMsg,
                     NothingHandleValue, aErrorOut);
}

// https://html.spec.whatwg.org/#hostloadimportedmodule
// static
bool ModuleLoaderBase::HostLoadImportedModule(JSContext* aCx,
                                              Handle<JSScript*> aReferrer,
                                              Handle<JSObject*> aModuleRequest,
                                              Handle<Value> aHostDefined,
                                              Handle<Value> aPayload) {
  // https://tc39.es/ecma262/#sec-HostLoadImportedModule

  // TODO: Bug 1968895 : Unify the fetching for static/dynamic import
  Rooted<JSObject*> object(aCx);
  if (aPayload.isObject()) {
    object = &aPayload.toObject();
  }
  bool isDynamicImport = object && IsPromiseObject(object);

  Rooted<JSString*> specifierString(
      aCx, GetModuleRequestSpecifier(aCx, aModuleRequest));
  if (!specifierString) {
    JS_ReportOutOfMemory(aCx);
    return false;
  }

  // Let url be the result of resolving a module specifier given referencing
  // module script and specifier.
  nsAutoJSString string;
  if (!string.init(aCx, specifierString)) {
    JS_ReportOutOfMemory(aCx);
    return false;
  }

  {
    // LoadedScript should only live in this block, otherwise it will be a GC
    // hazard
    RefPtr<LoadedScript> script(GetLoadedScriptOrNull(aReferrer));

    RefPtr<ModuleLoaderBase> loader = GetCurrentModuleLoader(aCx);
    if (!loader) {
      return false;
    }

    if (isDynamicImport && !loader->IsDynamicImportSupported()) {
      JS_ReportErrorNumberASCII(aCx, js::GetErrorMessage, nullptr,
                                JSMSG_DYNAMIC_IMPORT_NOT_SUPPORTED);
      return false;
    }

    // Step 7. Disallow further import maps given settingsObject.
    // Impl note: Disallow import maps is done in ModuleLoader::StartFetch

    // Step 8. Let url be the result of resolving a module specifier given
    //         referencingScript and moduleRequest.[[Specifier]], catching any
    //         exceptions. If they throw an exception, let resolutionError be
    //         the thrown exception.
    auto result = loader->ResolveModuleSpecifier(script, string);

    // Step 9. If the previous step threw an exception, then:
    if (result.isErr()) {
      // Step 9.1. Let completion be Completion Record { [[Type]]: throw,
      //           [[Value]]: resolutionError, [[Target]]: empty }.
      Rooted<Value> error(aCx);
      nsresult rv =
          loader->HandleResolveFailure(aCx, script, string, result.unwrapErr(),
                                       0, ColumnNumberOneOrigin(), &error);
      if (NS_FAILED(rv)) {
        JS_ReportOutOfMemory(aCx);
        return false;
      }

      // Step 9.2. Perform FinishLoadingImportedModule(referrer, moduleRequest,
      //           payload, completion).
      FinishLoadingImportedModuleFailed(aCx, aPayload, error);

      // Step 9.3. Return.
      return true;
    }

    MOZ_ASSERT(result.isOk());
    nsCOMPtr<nsIURI> uri = result.unwrap();
    MOZ_ASSERT(uri, "Failed to resolve module specifier");

    LOG(
        ("ModuleLoaderBase::HostLoadImportedModule loader (%p) uri %s referrer "
         "(%p)",
         loader.get(), uri->GetSpecOrDefault().get(), aReferrer.get()));

    ModuleType moduleType = GetModuleRequestType(aCx, aModuleRequest);
    if (!ModuleTypeAllowed(moduleType)) {
      LOG(("ModuleLoaderBase::HostLoadImportedModule uri %s, bad module type",
           uri->GetSpecOrDefault().get()));
      Rooted<Value> error(aCx);
      if (!CreateBadModuleTypeError(aCx, script, uri, &error)) {
        JS_ReportOutOfMemory(aCx);
        return false;
      }
      JS_SetPendingException(aCx, error);
      return false;
    }

    if (isDynamicImport) {
      Rooted<JSObject*> promise(aCx, &aPayload.toObject());
      RefPtr<ModuleLoadRequest> request = loader->CreateDynamicImport(
          aCx, uri, script, aModuleRequest, promise);
      if (!request) {
        // Throws TypeError if CreateDynamicImport returns nullptr.
        JS_ReportErrorNumberASCII(aCx, js::GetErrorMessage, nullptr,
                                  JSMSG_DYNAMIC_IMPORT_NOT_SUPPORTED);
        return false;
      }

      nsresult rv = loader->StartDynamicImport(request);
      if (NS_SUCCEEDED(rv)) {
        loader->OnDynamicImportStarted(request);
      } else {
        nsAutoCString url;
        uri->GetSpec(url);
        JS_ReportErrorNumberASCII(aCx, js::GetErrorMessage, nullptr,
                                  JSMSG_DYNAMIC_IMPORT_FAILED, url.get());
        return false;
      }
    } else {
      loader->StartFetchingModuleAndDependencies(
          aCx, ModuleMapKey(uri, moduleType), aReferrer, aModuleRequest,
          aHostDefined, aPayload);
    }
  }

  return true;
}

// static
bool ModuleLoaderBase::FinishLoadingImportedModule(
    JSContext* aCx, ModuleLoadRequest* aRequest) {
  // The request should been removed from mDynamicImportRequests.
  MOZ_ASSERT_IF(aRequest->IsDynamicImport(),
                !aRequest->mLoader->HasDynamicImport(aRequest));

  Rooted<JSObject*> module(aCx);
  {
    ModuleScript* moduleScript = aRequest->mModuleScript;
    MOZ_ASSERT(moduleScript);
    MOZ_ASSERT(moduleScript->ModuleRecord());
    module.set(moduleScript->ModuleRecord());
  }
  MOZ_ASSERT(module);

  Rooted<JSScript*> referrer(aCx, aRequest->mReferrerScript);
  Rooted<JSObject*> moduleReqObj(aCx, aRequest->mModuleRequestObj);
  Rooted<Value> statePrivate(aCx, aRequest->mPayload);
  Rooted<Value> payload(aCx, aRequest->mPayload);

  LOG(("ScriptLoadRequest (%p): FinishLoadingImportedModule module (%p)",
       aRequest, module.get()));
  bool usePromise = aRequest->HasScriptLoadContext();
  MOZ_ALWAYS_TRUE(JS::FinishLoadingImportedModule(aCx, referrer, moduleReqObj,
                                                  payload, module, usePromise));
  MOZ_ASSERT(!JS_IsExceptionPending(aCx));

  aRequest->mReferrerScript = nullptr;
  aRequest->mModuleRequestObj = nullptr;
  aRequest->mPayload.setUndefined();
  aRequest->ClearDynamicImport();

  return true;
}

// static
bool ModuleLoaderBase::ImportMetaResolve(JSContext* cx, unsigned argc,
                                         Value* vp) {
  CallArgs args = CallArgsFromVp(argc, vp);
  RootedValue modulePrivate(
      cx, js::GetFunctionNativeReserved(
              &args.callee(),
              static_cast<size_t>(ImportMetaSlots::ModulePrivateSlot)));

  // https://html.spec.whatwg.org/#hostgetimportmetaproperties
  // Step 4.1. Set specifier to ? ToString(specifier).
  //
  // https://tc39.es/ecma262/#sec-tostring
  RootedValue v(cx, args.get(ImportMetaResolveSpecifierArg));
  RootedString specifier(cx, ToString(cx, v));
  if (!specifier) {
    return false;
  }

  // Step 4.2, 4.3 are implemented in ImportMetaResolveImpl.
  RootedString url(cx, ImportMetaResolveImpl(cx, modulePrivate, specifier));
  if (!url) {
    return false;
  }

  // Step 4.4. Return the serialization of url.
  args.rval().setString(url);
  return true;
}

// static
JSString* ModuleLoaderBase::ImportMetaResolveImpl(
    JSContext* aCx, Handle<Value> aReferencingPrivate,
    Handle<JSString*> aSpecifier) {
  RootedString urlString(aCx);

  {
    // ModuleScript should only live in this block, otherwise it will be a GC
    // hazard
    RefPtr<ModuleScript> script =
        static_cast<ModuleScript*>(aReferencingPrivate.toPrivate());
    MOZ_ASSERT(script->IsModuleScript());
    MOZ_ASSERT(GetModulePrivate(script->ModuleRecord()) == aReferencingPrivate);

    RefPtr<ModuleLoaderBase> loader = GetCurrentModuleLoader(aCx);
    if (!loader) {
      return nullptr;
    }

    nsAutoJSString specifier;
    if (!specifier.init(aCx, aSpecifier)) {
      return nullptr;
    }

    auto result = loader->ResolveModuleSpecifier(script, specifier);
    if (result.isErr()) {
      Rooted<Value> error(aCx);
      nsresult rv = loader->HandleResolveFailure(
          aCx, script, specifier, result.unwrapErr(), 0,
          ColumnNumberOneOrigin(), &error);
      if (NS_FAILED(rv)) {
        JS_ReportOutOfMemory(aCx);
        return nullptr;
      }

      JS_SetPendingException(aCx, error);

      return nullptr;
    }

    nsCOMPtr<nsIURI> uri = result.unwrap();
    nsAutoCString url;
    MOZ_ALWAYS_SUCCEEDS(uri->GetAsciiSpec(url));

    urlString.set(JS_NewStringCopyZ(aCx, url.get()));
  }

  return urlString;
}

// static
bool ModuleLoaderBase::HostPopulateImportMeta(JSContext* aCx,
                                              Handle<Value> aReferencingPrivate,
                                              Handle<JSObject*> aMetaObject) {
  RefPtr<ModuleScript> script =
      static_cast<ModuleScript*>(aReferencingPrivate.toPrivate());
  MOZ_ASSERT(script->IsModuleScript());
  MOZ_ASSERT(GetModulePrivate(script->ModuleRecord()) == aReferencingPrivate);

  nsAutoCString url;
  MOZ_DIAGNOSTIC_ASSERT(script->BaseURL());
  MOZ_ALWAYS_SUCCEEDS(script->BaseURL()->GetAsciiSpec(url));

  Rooted<JSString*> urlString(aCx, JS_NewStringCopyZ(aCx, url.get()));
  if (!urlString) {
    JS_ReportOutOfMemory(aCx);
    return false;
  }

  // https://html.spec.whatwg.org/#import-meta-url
  if (!JS_DefineProperty(aCx, aMetaObject, "url", urlString,
                         JSPROP_ENUMERATE)) {
    return false;
  }

  // https://html.spec.whatwg.org/#import-meta-resolve
  // Define 'resolve' function on the import.meta object.
  JSFunction* resolveFunc = js::DefineFunctionWithReserved(
      aCx, aMetaObject, "resolve", ImportMetaResolve, ImportMetaResolveNumArgs,
      JSPROP_ENUMERATE);
  if (!resolveFunc) {
    return false;
  }

  // Store the 'active script' of the meta object into the function slot.
  // https://html.spec.whatwg.org/#active-script
  RootedObject resolveFuncObj(aCx, JS_GetFunctionObject(resolveFunc));
  js::SetFunctionNativeReserved(
      resolveFuncObj, static_cast<size_t>(ImportMetaSlots::ModulePrivateSlot),
      aReferencingPrivate);

  return true;
}

AutoOverrideModuleLoader::AutoOverrideModuleLoader(ModuleLoaderBase* aTarget,
                                                   ModuleLoaderBase* aLoader)
    : mTarget(aTarget) {
  mTarget->SetOverride(aLoader);
}

AutoOverrideModuleLoader::~AutoOverrideModuleLoader() {
  mTarget->ResetOverride();
}

void ModuleLoaderBase::SetOverride(ModuleLoaderBase* aLoader) {
  MOZ_ASSERT(!mOverriddenBy);
  MOZ_ASSERT(!aLoader->mOverriddenBy);
  MOZ_ASSERT(mGlobalObject == aLoader->mGlobalObject);
  mOverriddenBy = aLoader;
}

bool ModuleLoaderBase::IsOverridden() { return !!mOverriddenBy; }

bool ModuleLoaderBase::IsOverriddenBy(ModuleLoaderBase* aLoader) {
  return mOverriddenBy == aLoader;
}

void ModuleLoaderBase::ResetOverride() {
  MOZ_ASSERT(mOverriddenBy);
  mOverriddenBy = nullptr;
}

// static
ModuleLoaderBase* ModuleLoaderBase::GetCurrentModuleLoader(JSContext* aCx) {
  auto reportError = mozilla::MakeScopeExit([aCx]() {
    JS_ReportErrorASCII(aCx, "No ScriptLoader found for the current context");
  });

  Rooted<JSObject*> object(aCx, CurrentGlobalOrNull(aCx));
  if (!object) {
    return nullptr;
  }

  nsIGlobalObject* global = xpc::NativeGlobal(object);
  if (!global) {
    return nullptr;
  }

  ModuleLoaderBase* loader = global->GetModuleLoader(aCx);
  if (!loader) {
    return nullptr;
  }

  MOZ_ASSERT(loader->mGlobalObject == global);

  reportError.release();

  if (loader->mOverriddenBy) {
    MOZ_ASSERT(loader->mOverriddenBy->mGlobalObject == global);
    return loader->mOverriddenBy;
  }
  return loader;
}

// static
LoadedScript* ModuleLoaderBase::GetLoadedScriptOrNull(
    Handle<JSScript*> aReferrer) {
  if (!aReferrer) {
    return nullptr;
  }

  Value value = GetScriptPrivate(aReferrer);
  if (value.isUndefined()) {
    return nullptr;
  }

  return static_cast<LoadedScript*>(value.toPrivate());
}

nsresult ModuleLoaderBase::StartModuleLoad(ModuleLoadRequest* aRequest) {
  return StartOrRestartModuleLoad(aRequest, RestartRequest::No);
}

nsresult ModuleLoaderBase::RestartModuleLoad(ModuleLoadRequest* aRequest) {
  return StartOrRestartModuleLoad(aRequest, RestartRequest::Yes);
}

nsresult ModuleLoaderBase::StartOrRestartModuleLoad(ModuleLoadRequest* aRequest,
                                                    RestartRequest aRestart) {
  MOZ_ASSERT(aRequest->mLoader == this);
  MOZ_ASSERT(aRequest->IsFetching() || aRequest->IsPendingFetchingError());

  // NOTE: The LoadedScript::mDataType field used by the IsStencil call can be
  //       modified asynchronously after the StartFetch call.
  //       In order to avoid the race condition, cache the value here.
  bool isStencil = aRequest->IsStencil();

  MOZ_ASSERT_IF(isStencil, aRestart == RestartRequest::No);

  if (!isStencil) {
    aRequest->SetUnknownDataType();
  }

  if (LOG_ENABLED()) {
    nsAutoCString url;
    aRequest->mURI->GetAsciiSpec(url);
    LOG(("ScriptLoadRequest (%p): Start module load %s", aRequest, url.get()));
  }

  // If we're restarting the request, the module should already be in the
  // "fetching" map.
  MOZ_ASSERT_IF(
      aRestart == RestartRequest::Yes,
      IsModuleFetching(ModuleMapKey(aRequest->mURI, aRequest->mModuleType)));

  // Check with the derived class whether we should load this module.
  nsresult rv = NS_OK;
  if (!CanStartLoad(aRequest, &rv)) {
    return rv;
  }

  // Check whether the module has been fetched or is currently being fetched,
  // and if so wait for it rather than starting a new fetch.
  if (aRestart == RestartRequest::No &&
      ModuleMapContainsURL(
          ModuleMapKey(aRequest->mURI, aRequest->mModuleType))) {
    LOG(("ScriptLoadRequest (%p): Waiting for module fetch", aRequest));
    WaitForModuleFetch(aRequest);
    return NS_OK;
  }

  rv = StartFetch(aRequest);
  NS_ENSURE_SUCCESS(rv, rv);

  if (isStencil) {
    MOZ_ASSERT(
        IsModuleFetched(ModuleMapKey(aRequest->mURI, aRequest->mModuleType)));
    return NS_OK;
  }

  // We successfully started fetching a module so put its URL in the module
  // map and mark it as fetching.
  if (aRestart == RestartRequest::No) {
    SetModuleFetchStarted(aRequest);
  }

  return NS_OK;
}

bool ModuleLoaderBase::ModuleMapContainsURL(const ModuleMapKey& key) const {
  return IsModuleFetching(key) || IsModuleFetched(key);
}

bool ModuleLoaderBase::IsModuleFetching(const ModuleMapKey& key) const {
  return mFetchingModules.Contains(key);
}

bool ModuleLoaderBase::IsModuleFetched(const ModuleMapKey& key) const {
  return mFetchedModules.Contains(key);
}

nsresult ModuleLoaderBase::GetFetchedModuleURLs(nsTArray<nsCString>& aURLs) {
  for (const auto& entry : mFetchedModules) {
    nsIURI* uri = entry.GetData()->BaseURL();

    nsAutoCString spec;
    nsresult rv = uri->GetSpec(spec);
    NS_ENSURE_SUCCESS(rv, rv);

    aURLs.AppendElement(spec);
  }

  return NS_OK;
}

void ModuleLoaderBase::SetModuleFetchStarted(ModuleLoadRequest* aRequest) {
  // Update the module map to indicate that a module is currently being fetched.

  ModuleMapKey moduleMapKey(aRequest->mURI, aRequest->mModuleType);

  MOZ_ASSERT(aRequest->IsFetching() || aRequest->IsPendingFetchingError());
  MOZ_ASSERT(!ModuleMapContainsURL(moduleMapKey));

  RefPtr<LoadingRequest> loadingRequest = new LoadingRequest();
  loadingRequest->mRequest = aRequest;
  mFetchingModules.InsertOrUpdate(moduleMapKey, loadingRequest);
}

already_AddRefed<ModuleLoaderBase::LoadingRequest>
ModuleLoaderBase::SetModuleFetchFinishedAndGetWaitingRequests(
    ModuleLoadRequest* aRequest, nsresult aResult) {
  // Update module map with the result of fetching a single module script.
  //
  // If any requests for the same URL are waiting on this one to complete, call
  // ModuleLoaded or LoadFailed to resume or fail them as appropriate.

  MOZ_ASSERT(aRequest->mLoader == this);

  LOG(
      ("ScriptLoadRequest (%p): Module fetch finished (script == %p, result == "
       "%u)",
       aRequest, aRequest->mModuleScript.get(), unsigned(aResult)));

  ModuleMapKey moduleMapKey(aRequest->mURI, aRequest->mModuleType);

  auto entry = mFetchingModules.Lookup(moduleMapKey);
  if (!entry) {
    LOG(
        ("ScriptLoadRequest (%p): Key not found in mFetchingModules, "
         "assuming we have an inline module or have finished fetching already",
         aRequest));
    return nullptr;
  }

  // It's possible for a request to be cancelled and removed from the fetching
  // modules map and a new request started for the same URI and added to the
  // map. In this case we don't want the first cancelled request to complete the
  // later request (which will cause it to fail) so we ignore it.
  RefPtr<LoadingRequest> loadingRequest = entry.Data();
  if (loadingRequest->mRequest != aRequest) {
    MOZ_ASSERT(aRequest->IsCanceled());
    LOG(
        ("ScriptLoadRequest (%p): Ignoring completion of cancelled request "
         "that was removed from the map",
         aRequest));
    return nullptr;
  }

  MOZ_ALWAYS_TRUE(mFetchingModules.Remove(moduleMapKey));

  RefPtr<ModuleScript> moduleScript(aRequest->mModuleScript);
  MOZ_ASSERT(NS_FAILED(aResult) == !moduleScript);

  mFetchedModules.InsertOrUpdate(moduleMapKey, RefPtr{moduleScript});

  return loadingRequest.forget();
}

void ModuleLoaderBase::ResumeWaitingRequests(LoadingRequest* aLoadingRequest,
                                             bool aSuccess) {
  for (ModuleLoadRequest* request : aLoadingRequest->mWaiting) {
    ResumeWaitingRequest(request, aSuccess);
  }
}

void ModuleLoaderBase::ResumeWaitingRequest(ModuleLoadRequest* aRequest,
                                            bool aSuccess) {
  if (aSuccess) {
    aRequest->ModuleLoaded();
  } else {
    aRequest->LoadFailed();
  }

  if (!aRequest->IsErrored()) {
    OnFetchSucceeded(aRequest);
  } else {
    OnFetchFailed(aRequest);
  }
}

void ModuleLoaderBase::WaitForModuleFetch(ModuleLoadRequest* aRequest) {
  ModuleMapKey moduleMapKey(aRequest->mURI, aRequest->mModuleType);
  MOZ_ASSERT(ModuleMapContainsURL(moduleMapKey));

  if (auto entry = mFetchingModules.Lookup(moduleMapKey)) {
    RefPtr<LoadingRequest> loadingRequest = entry.Data();
    loadingRequest->mWaiting.AppendElement(aRequest);
    return;
  }

  RefPtr<ModuleScript> ms;
  MOZ_ALWAYS_TRUE(mFetchedModules.Get(moduleMapKey, getter_AddRefs(ms)));

  ResumeWaitingRequest(aRequest, bool(ms));
}

ModuleScript* ModuleLoaderBase::GetFetchedModule(
    const ModuleMapKey& moduleMapKey) const {
  if (LOG_ENABLED()) {
    nsAutoCString url;
    moduleMapKey.mUri->GetAsciiSpec(url);
    LOG(("GetFetchedModule %s", url.get()));
  }

  bool found;
  ModuleScript* ms = mFetchedModules.GetWeak(moduleMapKey, &found);
  MOZ_ASSERT(found);
  return ms;
}

nsresult ModuleLoaderBase::OnFetchComplete(ModuleLoadRequest* aRequest,
                                           nsresult aRv) {
  LOG(("ScriptLoadRequest (%p): OnFetchComplete result %x", aRequest,
       (unsigned)aRv));
  MOZ_ASSERT(aRequest->mLoader == this);
  MOZ_ASSERT(!aRequest->mModuleScript);

  nsresult rv = aRv;
  if (NS_SUCCEEDED(rv)) {
    rv = CreateModuleScript(aRequest);

#if defined(MOZ_DIAGNOSTIC_ASSERT_ENABLED)
    // If a module script was created, it should either have a module record
    // object or a parse error.
    if (ModuleScript* ms = aRequest->mModuleScript) {
      MOZ_DIAGNOSTIC_ASSERT(bool(ms->ModuleRecord()) != ms->HasParseError());
    }
#endif

    aRequest->ClearScriptSource();

    if (NS_FAILED(rv)) {
      aRequest->LoadFailed();
      return rv;
    }
  }

  RefPtr<LoadingRequest> waitingRequests =
      SetModuleFetchFinishedAndGetWaitingRequests(aRequest, rv);
  MOZ_ASSERT_IF(waitingRequests, waitingRequests->mRequest == aRequest);

  bool success = bool(aRequest->mModuleScript);
  MOZ_ASSERT(NS_SUCCEEDED(rv) == success);

  if (!aRequest->IsErrored()) {
    OnFetchSucceeded(aRequest);
  } else {
    OnFetchFailed(aRequest);
  }

  if (!waitingRequests) {
    return NS_OK;
  }

  ResumeWaitingRequests(waitingRequests, success);
  return NS_OK;
}

void ModuleLoaderBase::OnFetchSucceeded(ModuleLoadRequest* aRequest) {
  if (aRequest->IsTopLevel()) {
    StartFetchingModuleDependencies(aRequest);
  } else {
    MOZ_ASSERT(!aRequest->IsDynamicImport());
    AutoJSAPI jsapi;
    if (!jsapi.Init(mGlobalObject)) {
      return;
    }
    JSContext* cx = jsapi.cx();
    FinishLoadingImportedModule(cx, aRequest);

    aRequest->SetReady();
    aRequest->LoadFinished();
  }
}

void ModuleLoaderBase::OnFetchFailed(ModuleLoadRequest* aRequest) {
  MOZ_ASSERT(aRequest->IsErrored());
  // For dynamic import, the error handling is done in ProcessDynamicImport
  if (aRequest->IsDynamicImport()) {
    return;
  }

  if (aRequest->IsTopLevel()) {
    // https://html.spec.whatwg.org/#fetch-the-descendants-of-and-link-a-module-script
    // Step 2. If record is null, then:
    // Step 2.1. Set moduleScript's error to rethrow to moduleScript's parse
    //           error.
    if (aRequest->mModuleScript && !aRequest->mModuleScript->ModuleRecord()) {
      MOZ_ASSERT(aRequest->mModuleScript->HasParseError());
      Value parseError = aRequest->mModuleScript->ParseError();
      LOG(("ScriptLoadRequest (%p): found parse error", aRequest));
      aRequest->mModuleScript->SetErrorToRethrow(parseError);
    }
  } else {
    // The remaining case is static import.
    AutoJSAPI jsapi;
    if (!jsapi.Init(mGlobalObject)) {
      return;
    }
    JSContext* cx = jsapi.cx();

    MOZ_ASSERT(!aRequest->mPayload.isUndefined());
    Rooted<Value> statePrivate(cx, aRequest->mPayload);
    Rooted<Value> error(cx);

    // https://html.spec.whatwg.org/#hostloadimportedmodule
    //
    // Step 14.2. If moduleScript is null, then set completion to Completion
    //            Record { [[Type]]: throw, [[Value]]: a new TypeError,
    //            [[Target]]: empty }.
    //
    // Impl note:
    // When moduleScript is null, the ScriptLoader will call onerror handler.
    // So we don't actually create a TypeError for this.
    if (!aRequest->mModuleScript) {
      error = UndefinedValue();
    } else {
      // Step 14.3. Otherwise, if moduleScript's parse error is not null, then:
      //   1. Let parseError be moduleScript's parse error.
      //   2. Set completion to Completion Record { [[Type]]: throw,
      //      [[Value]]: parseError, [[Target]]: empty }.
      //   3. If loadState is not undefined and loadState.[[ErrorToRethrow]]
      //      is null, set loadState.[[ErrorToRethrow]] to parseError.
      MOZ_ASSERT(aRequest->mModuleScript->HasParseError());
      error = aRequest->mModuleScript->ParseError();
    }

    LOG(("ScriptLoadRequest (%p): FinishLoadingImportedModuleFailed",
         aRequest));
    // Step 14.5. Perform FinishLoadingImportedModule(referrer, moduleRequest,
    //            payload, completion).
    MOZ_ASSERT(!statePrivate.isUndefined());
    FinishLoadingImportedModuleFailed(cx, statePrivate, error);

    aRequest->mReferrerScript = nullptr;
    aRequest->mModuleRequestObj = nullptr;
    aRequest->mPayload.setUndefined();
  }
}

class ModuleErroredRunnable : public MicroTaskRunnable {
 public:
  explicit ModuleErroredRunnable(ModuleLoadRequest* aRequest)
      : mRequest(aRequest) {}

  virtual void Run(AutoSlowOperation& aAso) override {
    mRequest->ModuleErrored();
  }

 private:
  RefPtr<ModuleLoadRequest> mRequest;
};

void ModuleLoaderBase::DispatchModuleErrored(ModuleLoadRequest* aRequest) {
  if (aRequest->HasScriptLoadContext()) {
    CycleCollectedJSContext* context = CycleCollectedJSContext::Get();
    RefPtr<ModuleErroredRunnable> runnable =
        new ModuleErroredRunnable(aRequest);
    context->DispatchToMicroTask(runnable.forget());
  } else {
    aRequest->ModuleErrored();
  }
}

nsresult ModuleLoaderBase::CreateModuleScript(ModuleLoadRequest* aRequest) {
  MOZ_ASSERT(!aRequest->mModuleScript);
  MOZ_ASSERT(aRequest->mBaseURL);

  LOG(("ScriptLoadRequest (%p): Create module script", aRequest));

  AutoJSAPI jsapi;
  if (!jsapi.Init(mGlobalObject)) {
    return NS_ERROR_FAILURE;
  }

  nsresult rv;
  {
    JSContext* cx = jsapi.cx();
    Rooted<JSObject*> module(cx);

    CompileOptions options(cx);
    RootedScript introductionScript(cx);
    rv = mLoader->FillCompileOptionsForRequest(cx, aRequest, &options,
                                               &introductionScript);

    if (NS_SUCCEEDED(rv)) {
      Rooted<JSObject*> global(cx, mGlobalObject->GetGlobalJSObject());
      rv = CompileFetchedModule(cx, global, options, aRequest, &module);
    }

    MOZ_DIAGNOSTIC_ASSERT(NS_SUCCEEDED(rv) == (module != nullptr));

    if (module) {
      RootedScript moduleScript(cx, GetModuleScript(module));
      if (moduleScript) {
        RootedValue privateValue(cx);
        InstantiateOptions instantiateOptions(options);
        if (!UpdateDebugMetadata(cx, moduleScript, instantiateOptions,
                                 privateValue, nullptr, introductionScript,
                                 nullptr)) {
          return NS_ERROR_OUT_OF_MEMORY;
        }
      }
    }

    MOZ_ASSERT(aRequest->mLoadedScript->IsModuleScript());
    MOZ_ASSERT(aRequest->mFetchOptions->IsCompatible(
        aRequest->mLoadedScript->GetFetchOptions()));
#ifdef DEBUG
    {
      bool equals = false;
      aRequest->mURI->Equals(aRequest->mLoadedScript->GetURI(), &equals);
      MOZ_ASSERT(equals);
    }
#endif

    if (!aRequest->mLoadedScript->BaseURL()) {
      // If this script is not cached, the BaseURL should be copied from
      // request to script for later use.
      aRequest->mLoadedScript->SetBaseURL(aRequest->mBaseURL);
    } else {
      // If this script is cached, the BaseURL should match, which is
      // checked when looking for the cache.
#ifdef DEBUG
      bool equals = false;
      aRequest->mBaseURL->Equals(aRequest->mLoadedScript->BaseURL(), &equals);
      MOZ_ASSERT(equals);
#endif
    }
    RefPtr<ModuleScript> moduleScript =
        aRequest->mLoadedScript->AsModuleScript();

    // Update the module script's referrer policy to reflect any changes made
    // to the ModuleLoadRequest during HTTP response parsing.
    if (moduleScript->ReferrerPolicy() != aRequest->ReferrerPolicy()) {
      moduleScript->UpdateReferrerPolicy(aRequest->ReferrerPolicy());
    }
    aRequest->mModuleScript = moduleScript;

    moduleScript->SetForPreload(aRequest->mLoadContext->IsPreload());
    moduleScript->SetHadImportMap(HasImportMapRegistered());

    if (!module) {
      LOG(("ScriptLoadRequest (%p):   compilation failed (%d)", aRequest,
           unsigned(rv)));

      Rooted<Value> error(cx);
      if (!jsapi.HasException() || !jsapi.StealException(&error) ||
          error.isUndefined()) {
        aRequest->mModuleScript = nullptr;
        return NS_ERROR_FAILURE;
      }

      moduleScript->SetParseError(error);
      DispatchModuleErrored(aRequest);
      return NS_OK;
    }

    moduleScript->SetModuleRecord(module);

    // TODO: Bug 1968885: Remove ModuleLoaderBase::ResolveRequestedModules
    //
    // Validate requested modules and treat failure to resolve module specifiers
    // the same as a parse error.
    rv = ResolveRequestedModules(aRequest, nullptr);
    if (NS_FAILED(rv)) {
      if (!aRequest->IsErrored()) {
        aRequest->mModuleScript = nullptr;
        return rv;
      }
      DispatchModuleErrored(aRequest);
      return NS_OK;
    }
  }

  LOG(("ScriptLoadRequest (%p):   module script == %p", aRequest,
       aRequest->mModuleScript.get()));

  return rv;
}

nsresult ModuleLoaderBase::GetResolveFailureMessage(ResolveError aError,
                                                    const nsAString& aSpecifier,
                                                    nsAString& aResult) {
  AutoTArray<nsString, 1> errorParams;
  errorParams.AppendElement(aSpecifier);

  nsresult rv = nsContentUtils::FormatLocalizedString(
      nsContentUtils::eDOM_PROPERTIES, ResolveErrorInfo::GetString(aError),
      errorParams, aResult);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

nsresult ModuleLoaderBase::HandleResolveFailure(
    JSContext* aCx, LoadedScript* aScript, const nsAString& aSpecifier,
    ResolveError aError, uint32_t aLineNumber,
    ColumnNumberOneOrigin aColumnNumber, MutableHandle<Value> aErrorOut) {
  Rooted<JSString*> filename(aCx);
  if (aScript) {
    nsAutoCString url;
    aScript->BaseURL()->GetAsciiSpec(url);
    filename = JS_NewStringCopyZ(aCx, url.get());
  } else {
    filename = JS_NewStringCopyZ(aCx, "(unknown)");
  }

  if (!filename) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  nsAutoString errorText;
  nsresult rv = GetResolveFailureMessage(aError, aSpecifier, errorText);
  NS_ENSURE_SUCCESS(rv, rv);

  Rooted<JSString*> string(aCx, JS_NewUCStringCopyZ(aCx, errorText.get()));
  if (!string) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  if (!CreateError(aCx, JSEXN_TYPEERR, nullptr, filename, aLineNumber,
                   aColumnNumber, nullptr, string, NothingHandleValue,
                   aErrorOut)) {
    return NS_ERROR_OUT_OF_MEMORY;
  }

  return NS_OK;
}

ResolveResult ModuleLoaderBase::ResolveModuleSpecifier(
    LoadedScript* aScript, const nsAString& aSpecifier) {
  // Import Maps are not supported on workers/worklets.
  // See https://github.com/WICG/import-maps/issues/2
  MOZ_ASSERT_IF(!NS_IsMainThread(), mImportMap == nullptr);

  // Forward to the updated 'Resolve a module specifier' algorithm defined in
  // the Import Maps spec.
  return ImportMap::ResolveModuleSpecifier(mImportMap.get(), mLoader, aScript,
                                           aSpecifier);
}

nsresult ModuleLoaderBase::ResolveRequestedModules(
    ModuleLoadRequest* aRequest, nsTArray<ModuleMapKey>* aRequestedModulesOut) {
  MOZ_ASSERT_IF(aRequestedModulesOut, aRequestedModulesOut->IsEmpty());

  ModuleScript* ms = aRequest->mModuleScript;

  AutoJSAPI jsapi;
  if (!jsapi.Init(mGlobalObject)) {
    return NS_ERROR_FAILURE;
  }

  JSContext* cx = jsapi.cx();
  Rooted<JSObject*> moduleRecord(cx, ms->ModuleRecord());

  if (!IsCyclicModule(moduleRecord)) {
    return NS_OK;
  }

  uint32_t length = GetRequestedModulesCount(cx, moduleRecord);

  for (uint32_t i = 0; i < length; i++) {
    Rooted<JSString*> str(cx, GetRequestedModuleSpecifier(cx, moduleRecord, i));
    if (!str) {
      Rooted<Value> pendingException(cx);
      if (!JS_GetPendingException(cx, &pendingException)) {
        return NS_ERROR_FAILURE;
      }
      ms->SetParseError(pendingException);
      JS_ClearPendingException(cx);
      return NS_ERROR_FAILURE;
    }

    nsAutoJSString specifier;
    if (!specifier.init(cx, str)) {
      return NS_ERROR_FAILURE;
    }

    // Let url be the result of resolving a module specifier given module script
    // and requested.
    ModuleLoaderBase* loader = aRequest->mLoader;
    auto result = loader->ResolveModuleSpecifier(ms, specifier);
    if (result.isErr()) {
      uint32_t lineNumber = 0;
      ColumnNumberOneOrigin columnNumber;
      GetRequestedModuleSourcePos(cx, moduleRecord, i, &lineNumber,
                                  &columnNumber);

      Rooted<Value> error(cx);
      nsresult rv =
          loader->HandleResolveFailure(cx, ms, specifier, result.unwrapErr(),
                                       lineNumber, columnNumber, &error);
      NS_ENSURE_SUCCESS(rv, rv);

      ms->SetParseError(error);
      return NS_ERROR_FAILURE;
    }

    nsCOMPtr<nsIURI> uri = result.unwrap();
    if (aRequestedModulesOut) {
      // Let moduleType be the result of running the module type from module
      // request steps given moduleRequest.
      ModuleType moduleType = GetRequestedModuleType(cx, moduleRecord, i);

      aRequestedModulesOut->AppendElement(ModuleMapKey(uri, moduleType));
    }
  }

  return NS_OK;
}

void ModuleLoaderBase::StartFetchingModuleDependencies(
    ModuleLoadRequest* aRequest) {
  if (aRequest->IsCanceled()) {
    return;
  }

  MOZ_ASSERT(aRequest->mModuleScript);
  MOZ_ASSERT(!aRequest->mModuleScript->HasParseError());
  ModuleScript* moduleScript = aRequest->mModuleScript;
  MOZ_ASSERT(moduleScript->ModuleRecord());
  MOZ_ASSERT(aRequest->IsFetching() || aRequest->IsCompiling());
  MOZ_ASSERT(aRequest->IsTopLevel());

  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.Init(mGlobalObject))) {
    return;
  }
  JSContext* cx = jsapi.cx();

  Rooted<JSObject*> module(cx, moduleScript->ModuleRecord());

  LOG(
      ("ScriptLoadRequest (%p): module record (%p) Start fetching module "
       "dependencies",
       aRequest, module.get()));

  // Wrap the request into a JS::Value, and AddRef() it.
  // The Release() will be called in the resolved/rejected handlers.
  Rooted<Value> hostDefinedVal(cx, PrivateValue(aRequest));
  aRequest->AddRef();

  bool result = false;

  // PromiseJobRunnable::Call() is not executed if the global is being
  // destroyed. As a result, the promise returned by LoadRequestedModules may
  // neither resolve nor reject. To ensure module loading completes reliably in
  // chrome pages, we use the synchronous variant of LoadRequestedModules.
  bool isSync = aRequest->mURI->SchemeIs("chrome") ||
                aRequest->mURI->SchemeIs("resource");

  // TODO: Bug1973660: Use Promise version of LoadRequestedModules on Workers.
  if (aRequest->HasScriptLoadContext() && !isSync) {
    Rooted<JSFunction*> onResolved(
        cx, js::NewFunctionWithReserved(cx, OnLoadRequestedModulesResolved,
                                        OnLoadRequestedModulesResolvedNumArgs,
                                        0, "resolved"));
    if (!onResolved) {
      JS_ReportOutOfMemory(cx);
      return;
    }

    RootedFunction onRejected(
        cx, js::NewFunctionWithReserved(cx, OnLoadRequestedModulesRejected,
                                        OnLoadRequestedModulesRejectedNumArgs,
                                        0, "rejected"));
    if (!onRejected) {
      JS_ReportOutOfMemory(cx);
      return;
    }

    RootedObject resolveFuncObj(cx, JS_GetFunctionObject(onResolved));
    js::SetFunctionNativeReserved(resolveFuncObj, LoadReactionHostDefinedSlot,
                                  hostDefinedVal);

    RootedObject rejectFuncObj(cx, JS_GetFunctionObject(onRejected));
    js::SetFunctionNativeReserved(rejectFuncObj, LoadReactionHostDefinedSlot,
                                  hostDefinedVal);

    Rooted<JSObject*> loadPromise(cx);
    result = LoadRequestedModules(cx, module, hostDefinedVal, &loadPromise);
    AddPromiseReactions(cx, loadPromise, resolveFuncObj, rejectFuncObj);
  } else {
    result = LoadRequestedModules(cx, module, hostDefinedVal,
                                  OnLoadRequestedModulesResolved,
                                  OnLoadRequestedModulesRejected);
  }

  if (!result) {
    LOG(("ScriptLoadRequest (%p): LoadRequestedModules failed", aRequest));
    OnLoadRequestedModulesRejected(aRequest, UndefinedHandleValue);
  }
}

// static
bool ModuleLoaderBase::OnLoadRequestedModulesResolved(JSContext* aCx,
                                                      unsigned aArgc,
                                                      Value* aVp) {
  CallArgs args = CallArgsFromVp(aArgc, aVp);
  Rooted<Value> hostDefined(aCx);
  hostDefined = js::GetFunctionNativeReserved(&args.callee(),
                                              LoadReactionHostDefinedSlot);
  return OnLoadRequestedModulesResolved(aCx, hostDefined);
}

// static
bool ModuleLoaderBase::OnLoadRequestedModulesResolved(
    JSContext* aCx, Handle<Value> aHostDefined) {
  auto* request = static_cast<ModuleLoadRequest*>(aHostDefined.toPrivate());
  MOZ_ASSERT(request);
  return OnLoadRequestedModulesResolved(request);
}

// static
bool ModuleLoaderBase::OnLoadRequestedModulesResolved(
    ModuleLoadRequest* aRequest) {
  LOG(("ScriptLoadRequest (%p): LoadRequestedModules resolved", aRequest));
  if (!aRequest->IsCanceled()) {
    aRequest->SetReady();
    aRequest->LoadFinished();
  }

  // Decrease the reference 'AddRef'ed when converting the hostDefined.
  aRequest->Release();
  return true;
}

// static
bool ModuleLoaderBase::OnLoadRequestedModulesRejected(JSContext* aCx,
                                                      unsigned aArgc,
                                                      Value* aVp) {
  CallArgs args = CallArgsFromVp(aArgc, aVp);
  Rooted<Value> error(aCx, args.get(OnLoadRequestedModulesRejectedErrorArg));
  Rooted<Value> hostDefined(aCx);
  hostDefined = js::GetFunctionNativeReserved(&args.callee(),
                                              LoadReactionHostDefinedSlot);
  return OnLoadRequestedModulesRejected(aCx, hostDefined, error);
}

// static
bool ModuleLoaderBase::OnLoadRequestedModulesRejected(
    JSContext* aCx, Handle<Value> aHostDefined, Handle<Value> aError) {
  auto* request = static_cast<ModuleLoadRequest*>(aHostDefined.toPrivate());
  MOZ_ASSERT(request);
  return OnLoadRequestedModulesRejected(request, aError);
}

// static
bool ModuleLoaderBase::OnLoadRequestedModulesRejected(
    ModuleLoadRequest* aRequest, Handle<Value> error) {
  LOG(("ScriptLoadRequest (%p): LoadRequestedModules rejected", aRequest));
  ModuleScript* moduleScript = aRequest->mModuleScript;
  // https://html.spec.whatwg.org/#fetch-the-descendants-of-and-link-a-module-script
  // Step 7. Upon rejection of loadingPromise, run the following
  //         steps:
  // Step 7.1. If state.[[ErrorToRethrow]] is not null, set moduleScript's
  //           error to rethrow to state.[[ErrorToRethrow]] and run
  //           onComplete given moduleScript.
  if (moduleScript && !error.isUndefined()) {
    moduleScript->SetErrorToRethrow(error);
  } else {
    // Step 7.2. Otherwise, run onComplete given null.
    aRequest->mModuleScript = nullptr;
  }

  aRequest->ModuleErrored();

  // Decrease the reference 'AddRef'ed when converting the hostDefined.
  aRequest->Release();
  return true;
}

bool ModuleLoaderBase::GetImportMapSRI(
    nsIURI* aURI, nsIURI* aSourceURI, nsIConsoleReportCollector* aReporter,
    mozilla::dom::SRIMetadata* aMetadataOut) {
  MOZ_ASSERT(aMetadataOut->IsEmpty());
  MOZ_ASSERT(aURI);

  if (!HasImportMapRegistered()) {
    return false;
  }

  mozilla::Maybe<nsString> entry =
      ImportMap::LookupIntegrity(mImportMap.get(), aURI);
  if (entry.isNothing()) {
    return false;
  }

  mozilla::dom::SRICheck::IntegrityMetadata(
      *entry, aSourceURI->GetSpecOrDefault(), aReporter, aMetadataOut);
  return true;
}

void ModuleLoaderBase::StartFetchingModuleAndDependencies(
    JSContext* aCx, const ModuleMapKey& aRequestedModule,
    Handle<JSScript*> aReferrer, Handle<JSObject*> aModuleRequest,
    Handle<Value> aHostDefined, Handle<Value> aPayload) {
  MOZ_ASSERT(aReferrer);
  Rooted<Value> referrerPrivate(aCx, GetScriptPrivate(aReferrer));
  RefPtr<LoadedScript> referrer = GetLoadedScriptOrNull(aReferrer);

  // Check import map for integrity information
  mozilla::dom::SRIMetadata sriMetadata;
  GetImportMapSRI(aRequestedModule.mUri, referrer->GetURI(),
                  mLoader->GetConsoleReportCollector(), &sriMetadata);

  ModuleLoadRequest* root =
      static_cast<ModuleLoadRequest*>(aHostDefined.toPrivate());
  MOZ_ASSERT(root);
  LoadContextBase* loadContext = root->mLoadContext;

  RefPtr<ModuleLoadRequest> childRequest = CreateStaticImport(
      aRequestedModule.mUri, aRequestedModule.mModuleType,
      referrer->AsModuleScript(), sriMetadata, loadContext, this);
  LOG(("ScriptLoadRequest (%p): start fetch dependencies: root (%p)",
       childRequest.get(), root));

  childRequest->mReferrerScript = aReferrer;
  childRequest->mModuleRequestObj = aModuleRequest;
  childRequest->mPayload = aPayload;

  // To prevent mPayload from being GCed.
  mozilla::HoldJSObjects(childRequest.get());

  nsresult rv = StartModuleLoad(childRequest);
  if (NS_FAILED(rv)) {
    MOZ_ASSERT(!childRequest->mModuleScript);
    mLoader->ReportErrorToConsole(childRequest, rv);
    childRequest->LoadFailed();
    OnFetchFailed(childRequest);
  }
}

nsresult ModuleLoaderBase::StartDynamicImport(ModuleLoadRequest* aRequest) {
  MOZ_ASSERT(aRequest->mLoader == this);

  LOG(("ScriptLoadRequest (%p): Start dynamic import", aRequest));

  mDynamicImportRequests.AppendElement(aRequest);

  nsresult rv = StartModuleLoad(aRequest);
  if (NS_FAILED(rv)) {
    mLoader->ReportErrorToConsole(aRequest, rv);
    RemoveDynamicImport(aRequest);
  }
  return rv;
}

void ModuleLoaderBase::FinishDynamicImportAndReject(ModuleLoadRequest* aRequest,
                                                    nsresult aResult) {
  AutoJSAPI jsapi;
  MOZ_ASSERT(NS_FAILED(aResult));
  if (!jsapi.Init(mGlobalObject)) {
    return;
  }

  if (aRequest->mPayload.isUndefined()) {
    // Import has already been completed.
    return;
  }

  JSContext* cx = jsapi.cx();
  Rooted<Value> payload(cx, aRequest->mPayload);

  if (NS_FAILED(aResult) &&
      aResult != NS_SUCCESS_DOM_SCRIPT_EVALUATION_THREW_UNCATCHABLE) {
    MOZ_ASSERT(!JS_IsExceptionPending(cx));
    nsAutoCString url;
    aRequest->mURI->GetSpec(url);
    JS_ReportErrorNumberASCII(cx, js::GetErrorMessage, nullptr,
                              JSMSG_DYNAMIC_IMPORT_FAILED, url.get());
    FinishLoadingImportedModuleFailedWithPendingException(cx, payload);
  } else {
    FinishLoadingImportedModuleFailed(cx, payload, UndefinedHandleValue);
  }

  aRequest->ClearDynamicImport();
}

ModuleLoaderBase::ModuleLoaderBase(ScriptLoaderInterface* aLoader,
                                   nsIGlobalObject* aGlobalObject)
    : mGlobalObject(aGlobalObject), mLoader(aLoader) {
  MOZ_ASSERT(mGlobalObject);
  MOZ_ASSERT(mLoader);

  EnsureModuleHooksInitialized();
}

ModuleLoaderBase::~ModuleLoaderBase() {
  mDynamicImportRequests.CancelRequestsAndClear();

  LOG(("ModuleLoaderBase::~ModuleLoaderBase %p", this));
}

void ModuleLoaderBase::CancelFetchingModules() {
  for (const auto& entry : mFetchingModules) {
    RefPtr<LoadingRequest> loadingRequest = entry.GetData();

    // The compile task might not execute if the global is shutting down, while
    // the root module is still awaiting the result of the compiling request.
    // Therefore, we call OnFetchFailed to notify the root module of the
    // failure.
    bool isCompiling = loadingRequest->mRequest->IsCompiling();
    if (isCompiling) {
      OnFetchFailed(loadingRequest->mRequest);
    }

    loadingRequest->mRequest->Cancel();

    for (const auto& request : loadingRequest->mWaiting) {
      request->Cancel();
      if (isCompiling) {
        OnFetchFailed(request);
      }
    }
  }

  // We don't clear mFetchingModules here, as the fetching requests might arrive
  // after the global is still shutting down.
}

void ModuleLoaderBase::Shutdown() {
  CancelAndClearDynamicImports();

  for (const auto& entry : mFetchingModules) {
    RefPtr<LoadingRequest> loadingRequest(entry.GetData());
    if (loadingRequest) {
      ResumeWaitingRequests(loadingRequest, false);
    }
  }

  for (const auto& entry : mFetchedModules) {
    if (entry.GetData()) {
      entry.GetData()->Shutdown();
    }
  }

  mFetchingModules.Clear();
  mFetchedModules.Clear();
  mGlobalObject = nullptr;
  mLoader = nullptr;
}

bool ModuleLoaderBase::HasFetchingModules() const {
  return !mFetchingModules.IsEmpty();
}

bool ModuleLoaderBase::HasPendingDynamicImports() const {
  return !mDynamicImportRequests.isEmpty();
}

// TODO: Bug 1968890 : Update error handling for dynamic import
void ModuleLoaderBase::CancelDynamicImport(ModuleLoadRequest* aRequest,
                                           nsresult aResult) {
  // aRequest may have already been unlinked by CC.
  MOZ_ASSERT(aRequest->mLoader == this || !aRequest->mLoader);

  RefPtr<ScriptLoadRequest> req = mDynamicImportRequests.Steal(aRequest);
  if (!aRequest->IsCanceled()) {
    // If the ClearDynamicImport() has been called, then it should have been
    // removed from mDynamicImportRequests as well.
    MOZ_ASSERT(!aRequest->mPayload.isUndefined());

    aRequest->Cancel();
    // FinishDynamicImport must happen exactly once for each dynamic import
    // request. If the load is aborted we do it when we remove the request
    // from mDynamicImportRequests.
    FinishDynamicImportAndReject(aRequest, aResult);
  }
}

void ModuleLoaderBase::RemoveDynamicImport(ModuleLoadRequest* aRequest) {
  MOZ_ASSERT(aRequest->IsDynamicImport());
  mDynamicImportRequests.Remove(aRequest);
}

#ifdef DEBUG
bool ModuleLoaderBase::HasDynamicImport(
    const ModuleLoadRequest* aRequest) const {
  MOZ_ASSERT(aRequest->mLoader == this);
  return mDynamicImportRequests.Contains(
      const_cast<ModuleLoadRequest*>(aRequest));
}
#endif

bool ModuleLoaderBase::InstantiateModuleGraph(ModuleLoadRequest* aRequest) {
  // Instantiate a top-level module and record any error.

  MOZ_ASSERT(aRequest);
  MOZ_ASSERT(aRequest->mLoader == this);
  MOZ_ASSERT(aRequest->IsTopLevel());

  LOG(("ScriptLoadRequest (%p): Instantiate module graph", aRequest));

  AUTO_PROFILER_LABEL("ModuleLoaderBase::InstantiateModuleGraph", JS);

  ModuleScript* moduleScript = aRequest->mModuleScript;
  MOZ_ASSERT(moduleScript);

  MOZ_ASSERT(!moduleScript->HasParseError());
  MOZ_ASSERT(moduleScript->ModuleRecord());

  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.Init(mGlobalObject))) {
    return false;
  }

  JSContext* cx = jsapi.cx();
  Rooted<JSObject*> module(cx, moduleScript->ModuleRecord());
  if (!xpc::Scriptability::AllowedIfExists(module)) {
    return true;
  }

  if (!ModuleLink(jsapi.cx(), module)) {
    LOG(("ScriptLoadRequest (%p): Instantiate failed", aRequest));
    MOZ_ASSERT(jsapi.HasException());
    RootedValue exception(jsapi.cx());
    if (!jsapi.StealException(&exception)) {
      return false;
    }
    MOZ_ASSERT(!exception.isUndefined());
    moduleScript->SetErrorToRethrow(exception);
  }

  return true;
}

void ModuleLoaderBase::ProcessDynamicImport(ModuleLoadRequest* aRequest) {
  AutoJSAPI jsapi;
  if (!jsapi.Init(GetGlobalObject())) {
    return;
  }

  JSContext* cx = jsapi.cx();
  if (!aRequest->mModuleScript) {
    FinishDynamicImportAndReject(aRequest, NS_ERROR_FAILURE);
    return;
  }

  if (aRequest->mModuleScript->HasParseError()) {
    Rooted<Value> payload(cx, aRequest->mPayload);
    Rooted<Value> error(cx, aRequest->mModuleScript->ParseError());
    FinishLoadingImportedModuleFailed(cx, payload, error);
    return;
  }

  FinishLoadingImportedModule(cx, aRequest);
}

nsresult ModuleLoaderBase::EvaluateModule(ModuleLoadRequest* aRequest) {
  MOZ_ASSERT(aRequest->mLoader == this);

  mozilla::nsAutoMicroTask mt;
  mozilla::dom::AutoEntryScript aes(mGlobalObject, "EvaluateModule",
                                    NS_IsMainThread());

  return EvaluateModuleInContext(aes.cx(), aRequest, ReportModuleErrorsAsync);
}

nsresult ModuleLoaderBase::EvaluateModuleInContext(
    JSContext* aCx, ModuleLoadRequest* aRequest,
    ModuleErrorBehaviour errorBehaviour) {
  MOZ_ASSERT(aRequest->mLoader == this);
  MOZ_ASSERT_IF(!mGlobalObject->GetModuleLoader(aCx)->IsOverridden(),
                mGlobalObject->GetModuleLoader(aCx) == this);
  MOZ_ASSERT_IF(mGlobalObject->GetModuleLoader(aCx)->IsOverridden(),
                mGlobalObject->GetModuleLoader(aCx)->IsOverriddenBy(this));
  MOZ_ASSERT(!aRequest->IsDynamicImport());

  AUTO_PROFILER_LABEL("ModuleLoaderBase::EvaluateModule", JS);

  nsAutoCString profilerLabelString;
  if (aRequest->HasScriptLoadContext()) {
    aRequest->GetScriptLoadContext()->GetProfilerLabel(profilerLabelString);
  }

  LOG(("ScriptLoadRequest (%p): Evaluate Module", aRequest));
  AUTO_PROFILER_MARKER_TEXT("ModuleEvaluation", JS,
                            MarkerInnerWindowIdFromJSContext(aCx),
                            profilerLabelString);

  MOZ_ASSERT(aRequest->mModuleScript);
  MOZ_ASSERT_IF(aRequest->HasScriptLoadContext(),
                !aRequest->GetScriptLoadContext()->mCompileOrDecodeTask);

  ModuleScript* moduleScript = aRequest->mModuleScript;
  if (moduleScript->HasErrorToRethrow()) {
    LOG(("ScriptLoadRequest (%p):   module has error to rethrow", aRequest));
    Rooted<Value> error(aCx, moduleScript->ErrorToRethrow());
    JS_SetPendingException(aCx, error);
    return NS_OK;
  }

  Rooted<JSObject*> module(aCx, moduleScript->ModuleRecord());
  MOZ_ASSERT(module);
  MOZ_ASSERT(CurrentGlobalOrNull(aCx) == GetNonCCWObjectGlobal(module));

  if (!xpc::Scriptability::AllowedIfExists(module)) {
    return NS_OK;
  }

  if (aRequest->HasScriptLoadContext()) {
    TRACE_FOR_TEST(aRequest, "scriptloader_evaluate_module");
  }

  Rooted<Value> rval(aCx);

  // TODO: Bug 1973321: Prepare Bytecode encoding for dynamic import
  mLoader->MaybePrepareModuleForBytecodeEncodingBeforeExecute(aCx, aRequest);

  bool ok = ModuleEvaluate(aCx, module, &rval);

  // ModuleEvaluate will usually set a pending exception if it returns false,
  // unless the user cancels execution.
  MOZ_ASSERT_IF(ok, !JS_IsExceptionPending(aCx));

  nsresult rv = NS_OK;
  if (!ok || IsModuleEvaluationAborted(aRequest)) {
    LOG(("ScriptLoadRequest (%p):   evaluation failed", aRequest));
    // For a dynamic import, the promise is rejected. Otherwise an error is
    // reported by AutoEntryScript.
    rv = NS_ERROR_ABORT;
  }

  // ModuleEvaluate returns a promise unless the user cancels the execution in
  // which case rval will be undefined. We should treat it as a failed
  // evaluation, and reject appropriately.
  Rooted<JSObject*> evaluationPromise(aCx);
  if (rval.isObject()) {
    evaluationPromise.set(&rval.toObject());
  }

  // If the promise is rejected, the value is unwrapped from the promise value.
  if (!ThrowOnModuleEvaluationFailure(aCx, evaluationPromise, errorBehaviour)) {
    LOG(("ScriptLoadRequest (%p):   evaluation failed on throw", aRequest));
  }

  rv = mLoader->MaybePrepareModuleForBytecodeEncodingAfterExecute(aRequest,
                                                                  NS_OK);

  mLoader->MaybeTriggerBytecodeEncoding();

  return rv;
}

void ModuleLoaderBase::CancelAndClearDynamicImports() {
  while (ScriptLoadRequest* req = mDynamicImportRequests.getFirst()) {
    // This also removes the request from the list.
    CancelDynamicImport(req->AsModuleRequest(), NS_ERROR_ABORT);
  }
}

UniquePtr<ImportMap> ModuleLoaderBase::ParseImportMap(
    ScriptLoadRequest* aRequest) {
  AutoJSAPI jsapi;
  if (!jsapi.Init(GetGlobalObject())) {
    return nullptr;
  }

  MOZ_ASSERT(aRequest->IsTextSource());
  MaybeSourceText maybeSource;
  nsresult rv = aRequest->GetScriptSource(jsapi.cx(), &maybeSource,
                                          aRequest->mLoadContext.get());
  if (NS_FAILED(rv)) {
    return nullptr;
  }

  SourceText<char16_t>& text = maybeSource.ref<SourceText<char16_t>>();
  ReportWarningHelper warning{mLoader, aRequest};

  // https://html.spec.whatwg.org/multipage/webappapis.html#create-an-import-map-parse-result
  // Step 2. Parse an import map string given input and baseURL, catching any
  // exceptions. If this threw an exception, then set result's error to rethrow
  // to that exception. Otherwise, set result's import map to the return value.
  //
  // https://html.spec.whatwg.org/multipage/webappapis.html#register-an-import-map
  // Step 1. If result's error to rethrow is not null, then report the exception
  // given by result's error to rethrow and return.
  //
  // Impl note: We didn't implement 'Import map parse result' from the spec,
  // https://html.spec.whatwg.org/multipage/webappapis.html#import-map-parse-result
  // As the struct has another item called 'error to rethow' to store the
  // exception thrown during parsing import-maps, and report that exception
  // while registering an import map. Currently only inline import-maps are
  // supported, therefore parsing and registering import-maps will be executed
  // consecutively. To simplify the implementation, we didn't create the 'error
  // to rethow' item and report the exception immediately(done in ~AutoJSAPI).
  return ImportMap::ParseString(jsapi.cx(), text, aRequest->mBaseURL, warning);
}

void ModuleLoaderBase::RegisterImportMap(UniquePtr<ImportMap> aImportMap) {
  // Check for aImportMap is done in ScriptLoader.
  MOZ_ASSERT(aImportMap);

  // https://html.spec.whatwg.org/multipage/webappapis.html#register-an-import-map
  // The step 1(report the exception if there's an error) is done in
  // ParseImportMap.
  //
  // Step 2. Assert: global's import map is an empty import map.
  // Impl note: The default import map from the spec is an empty import map, but
  // from the implementation it defaults to nullptr, so we check if the global's
  // import map is null here.
  //
  // Also see
  // https://html.spec.whatwg.org/multipage/webappapis.html#empty-import-map
  MOZ_ASSERT(!mImportMap);

  // Step 3. Set global's import map to result's import map.
  mImportMap = std::move(aImportMap);

  // Any import resolution has been invalidated by the addition of the import
  // map. If speculative preloading is currently fetching any modules then
  // cancel their requests and remove them from the map.
  //
  // The cancelled requests will still complete later so we have to check this
  // in SetModuleFetchFinishedAndGetWaitingRequests.
  for (const auto& entry : mFetchingModules) {
    LoadingRequest* loadingRequest = entry.GetData();
    MOZ_DIAGNOSTIC_ASSERT(loadingRequest->mRequest->mLoadContext->IsPreload());
    loadingRequest->mRequest->Cancel();
    for (const auto& request : loadingRequest->mWaiting) {
      MOZ_DIAGNOSTIC_ASSERT(request->mLoadContext->IsPreload());
      request->Cancel();
    }
  }
  mFetchingModules.Clear();

  // If speculative preloading has added modules to the module map, remove
  // them.
  for (const auto& entry : mFetchedModules) {
    ModuleScript* script = entry.GetData();
    if (script) {
      MOZ_DIAGNOSTIC_ASSERT(
          script->ForPreload(),
          "Non-preload module loads should block import maps");
      MOZ_DIAGNOSTIC_ASSERT(!script->HadImportMap(),
                            "Only one import map can be registered");
#if defined(MOZ_DIAGNOSTIC_ASSERT_ENABLED)
      if (JSObject* module = script->ModuleRecord()) {
        MOZ_DIAGNOSTIC_ASSERT(!ModuleIsLinked(module));
      }
#endif
      script->Shutdown();
    }
  }
  mFetchedModules.Clear();
}

void ModuleLoaderBase::CopyModulesTo(ModuleLoaderBase* aDest) {
  MOZ_ASSERT(aDest->mFetchingModules.IsEmpty());
  MOZ_ASSERT(aDest->mFetchedModules.IsEmpty());
  MOZ_ASSERT(mFetchingModules.IsEmpty());

  for (const auto& entry : mFetchedModules) {
    RefPtr<ModuleScript> moduleScript = entry.GetData();
    if (!moduleScript) {
      continue;
    }
    aDest->mFetchedModules.InsertOrUpdate(entry, moduleScript);
  }
}

void ModuleLoaderBase::MoveModulesTo(ModuleLoaderBase* aDest) {
  MOZ_ASSERT(mFetchingModules.IsEmpty());
  MOZ_ASSERT(aDest->mFetchingModules.IsEmpty());

  for (const auto& entry : mFetchedModules) {
    RefPtr<ModuleScript> moduleScript = entry.GetData();
    if (!moduleScript) {
      continue;
    }

#ifdef DEBUG
    if (auto existingEntry = aDest->mFetchedModules.Lookup(entry)) {
      MOZ_ASSERT(moduleScript == existingEntry.Data());
    }
#endif

    aDest->mFetchedModules.InsertOrUpdate(entry, moduleScript);
  }

  mFetchedModules.Clear();
}

#undef LOG
#undef LOG_ENABLED

}  // namespace JS::loader
