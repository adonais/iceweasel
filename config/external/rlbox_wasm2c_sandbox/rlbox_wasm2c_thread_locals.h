/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef rlbox_wasm2c_thread_locals_h_
#define rlbox_wasm2c_thread_locals_h_

#ifdef MOZ_USING_WASM_SANDBOXING

#  include "wasm-rt.h"

#  if defined(__cplusplus)
extern "C" {
#  endif

void moz_wasm2c_trap_handler(wasm_rt_trap_t code);

#  ifdef WASM_RT_GROW_FAILED_CRASH_OR_REDIRECT
void moz_wasm2c_set_memgrow_redirect_target(void (*fn)());
#  endif

void moz_wasm2c_memgrow_failed();

#  if defined(__cplusplus)
}
#  endif

#endif

#endif
