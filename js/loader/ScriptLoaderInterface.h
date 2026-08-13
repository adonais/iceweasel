/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef js_loader_ScriptLoaderInterface_h
#define js_loader_ScriptLoaderInterface_h

#include "nsISupports.h"
#include "nsStringFwd.h"
#include "nsTArray.h"
#include "ScriptKind.h"  // JS::loader::ScriptKind

#include "js/TypeDecls.h"  // JSContext, JS::MutableHandle, JSScript

class nsIConsoleReportCollector;
class nsIURI;

namespace JS {

class CompileOptions;

namespace loader {

class ModuleLoadRequest;
class ScriptFetchOptions;
class ScriptLoadRequest;
class ScriptLoadRequestList;

/*
 * [DOMDOC] Shared Classic/Module Script Methods
 *
 * The ScriptLoaderInterface defines the shared methods needed by both
 * ScriptLoaders (loading classic scripts) and ModuleLoaders (loading module
 * scripts). These include:
 *
 *     * Error Logging
 *     * Generating the compile options
 *     * Optional: Caching
 *
 * ScriptLoaderInterface does not provide any implementations.
 * It enables the ModuleLoaderBase to reference back to the behavior implemented
 * by a given ScriptLoader.
 *
 * Not all methods will be used by all ModuleLoaders. For example, caching
 * does not apply to workers, as we only work with source text there.
 * Fully virtual methods are implemented by all.
 *
 */

class ScriptLoaderInterface : public nsISupports {
 public:
  // Alias common classes.
  using ScriptFetchOptions = JS::loader::ScriptFetchOptions;
  using ScriptKind = JS::loader::ScriptKind;
  using ScriptLoadRequest = JS::loader::ScriptLoadRequest;
  using ScriptLoadRequestList = JS::loader::ScriptLoadRequestList;
  using ModuleLoadRequest = JS::loader::ModuleLoadRequest;

  virtual ~ScriptLoaderInterface() = default;

  // In some environments, we will need to default to a base URI
  virtual nsIURI* GetBaseURI() const = 0;

  virtual void ReportErrorToConsole(ScriptLoadRequest* aRequest,
                                    nsresult aResult) const = 0;

  virtual void ReportWarningToConsole(
      ScriptLoadRequest* aRequest, const char* aMessageName,
      const nsTArray<nsString>& aParams = nsTArray<nsString>()) const = 0;

  // Similar to Report*ToConsole(), only non-null in dom/script/ScriptLoader
  // as we currently only load importmaps there.
  virtual nsIConsoleReportCollector* GetConsoleReportCollector() const {
    return nullptr;
  }

  // Fill in CompileOptions, as well as produce the introducer script for
  // subsequent calls to UpdateDebuggerMetadata
  virtual nsresult FillCompileOptionsForRequest(
      JSContext* cx, ScriptLoadRequest* aRequest, CompileOptions* aOptions,
      MutableHandle<JSScript*> aIntroductionScript) = 0;

  virtual nsresult MaybePrepareModuleForDiskCacheAfterExecute(
      ModuleLoadRequest* aRequest, nsresult aRv) {
    return NS_OK;
  }

  virtual void MaybeUpdateDiskCache() {}

  // Import map is supported if the global implements 'Windows'.
  // See https://html.spec.whatwg.org/#concept-global-import-map
  virtual bool IsImportMapSupported() const { return false; }
};

}  // namespace loader
}  // namespace JS

#endif  // js_loader_ScriptLoaderInterface_h
