/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifdef MOZ_USING_WASM_SANDBOXING

// For MOZ_CRASH_UNSAFE_PRINTF
#  include "mozilla/Assertions.h"
// For MOZ_RUNINIT
#  include "mozilla/Attributes.h"
#  include "mozilla/mozalloc_oom.h"

// Load general firefox configuration of RLBox
#  include "mozilla/rlbox/rlbox_config.h"
#  include "mozilla/rlbox/rlbox_wasm2c_tls.hpp"
#  include "wasm-rt.h"

#  ifdef WASM_RT_GROW_FAILED_CRASH_OR_REDIRECT
#    include <mutex>
#  else
#    include "nsExceptionHandler.h"
#  endif

#  include "rlbox_wasm2c_thread_locals.h"

// The MingW compiler does not correctly handle static thread_local inline
// members. We instead TLS storage via functions. This can be removed if the
// MingW bug is fixed.
RLBOX_WASM2C_SANDBOX_STATIC_VARIABLES();

extern "C" {

// Any error encountered by the wasm2c runtime or wasm sandboxed library code
// is configured to call the below trap handler.
void moz_wasm2c_trap_handler(wasm_rt_trap_t code) {
  MOZ_CRASH_UNSAFE_PRINTF("wasm2c crash: %s", wasm_rt_strerror(code));
}

// The below function is called if a malloc in sandboxed code returns null
// This indicates that the sandbox has run out of memory.
#  ifdef WASM_RT_GROW_FAILED_CRASH_OR_REDIRECT

static void (*gMemGrowFailedRedirect)() = nullptr;
#    ifdef _WIN32
MOZ_RUNINIT
#    endif
std::mutex gMemGrowFailedRedirectMutex;

void moz_wasm2c_set_memgrow_redirect_target(void (*fn)()) {
  const std::lock_guard<std::mutex> lock(gMemGrowFailedRedirectMutex);
  gMemGrowFailedRedirect = fn;
}

void moz_wasm2c_memgrow_failed() {
  void (*redirect)() = nullptr;
  {
    const std::lock_guard<std::mutex> lock(gMemGrowFailedRedirectMutex);
    redirect = gMemGrowFailedRedirect;
  }

  if (redirect != nullptr) {
    redirect();
  } else {
    MOZ_CRASH("wasm2c memory grow failed");
  }
}

#  else

void moz_wasm2c_memgrow_failed() {
  CrashReporter::RecordAnnotationBool(
      CrashReporter::Annotation::WasmLibrarySandboxMallocFailed, true);
}

#  endif

// This function is called when mozalloc_handle_oom is called from within
// the sandbox. We redirect to that function, ignoring the ctx argument, which
// is the sandbox itself.
void w2c_env_mozalloc_handle_oom(void* ctx, uint32_t size) {
  mozalloc_handle_oom(size);
}
}

#endif
