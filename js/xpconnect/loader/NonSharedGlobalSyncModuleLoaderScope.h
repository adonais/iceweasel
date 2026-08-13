/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_loader_NonSharedGlobalSyncModuleLoaderScope_h
#define mozilla_loader_NonSharedGlobalSyncModuleLoaderScope_h

#include "mozilla/Attributes.h"   // MOZ_STACK_CLASS
#include "mozilla/Maybe.h"        // mozilla::Maybe
#include "mozilla/RefPtr.h"       // RefPtr
#include "mozilla/ThreadLocal.h"  // MOZ_THREAD_LOCAL

#include "mozJSModuleLoader.h"

#include "js/loader/ModuleLoaderBase.h"  // JS::loader::AutoOverrideModuleLoader

class nsIGlobalObject;

namespace mozilla::loader {

// Automatically allocate and initialize a sync module loader for given
// non-shared global, and override the module loader for the global with sync
// module loader.
//
// This is not re-entrant, and the consumer must check IsActive method before
// allocating this on the stack.
//
// The consumer should ensure the target global's module loader has no
// ongoing fetching modules (ModuleLoaderBase::HasFetchingModules).
// If there's any fetching modules, the consumer should wait for them before
// allocating this class on the stack.
//
// The consumer should also verify that the target global has module loader,
// as a part of the above step.
//
// The loader returned by ActiveLoader can be reused only when
// ActiveLoader's global matches the global the consumer wants to use.
class MOZ_STACK_CLASS NonSharedGlobalSyncModuleLoaderScope {
 public:
  NonSharedGlobalSyncModuleLoaderScope(JSContext* aCx,
                                       nsIGlobalObject* aGlobal);
  ~NonSharedGlobalSyncModuleLoaderScope();

  // After successfully importing a module graph, move all imported modules to
  // the target global's module loader.
  void Finish();

  // Returns true if another instance of NonSharedGlobalSyncModuleLoaderScope
  // is on stack.
  static bool IsActive();

  static mozJSModuleLoader* ActiveLoader();

  static void InitStatics();

 private:
  RefPtr<mozJSModuleLoader> mLoader;

  // Reference to thread-local module loader on the stack.
  // This is used by another sync module load during a sync module load is
  // ongoing.
  static MOZ_THREAD_LOCAL(mozJSModuleLoader*) sTlsActiveLoader;

  // The module loader of the target global.
  RefPtr<JS::loader::ModuleLoaderBase> mAsyncModuleLoader;

  mozilla::Maybe<JS::loader::AutoOverrideModuleLoader> mMaybeOverride;
};

}  // namespace mozilla::loader

#endif  // mozilla_loader_NonSharedGlobalSyncModuleLoaderScope_h
