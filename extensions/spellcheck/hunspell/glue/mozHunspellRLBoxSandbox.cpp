/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozHunspellRLBoxSandbox.h"
#include "mozHunspellRLBoxGlue.h"

FileMgr::FileMgr(const char* aFilename, const char* aKey) : mFd(0) {
  // The key is not used in firefox
  mFd = moz_glue_hunspell_create_filemgr(aFilename);
}

bool FileMgr::getline(std::string& aResult) {
  char* line = nullptr;
  bool ok = moz_glue_hunspell_get_line(mFd, &line);
  if (ok && line) {
    aResult = line;
    free(line);
  }
  return ok;
}

int FileMgr::getlinenum() const { return moz_glue_hunspell_get_line_num(mFd); }

FileMgr::~FileMgr() { moz_glue_hunspell_destruct_filemgr(mFd); }

// Glue code to set global callbacks
//
// When hunspell is wasmboxed, each sandbox instance has its own copy of these
// statics, so the callbacks below are per-instance state.
//
// When the sandbox is disabled (replaced with the noop sandbox), all live
// RLBoxHunspell instances -- there is one per loaded dictionary -- share a
// single copy of these statics. Unlike woff2 (see
// modules/woff2/RLBoxWOFF2Sandbox.cpp) we cannot skip registration in that
// case, because these callbacks are the only way sandboxed hunspell can read
// dictionary files. Sharing them is nonetheless safe, for two reasons that are
// easy to break:
//
//  1. RLBoxHunspell only registers callbacks, and only invokes the sandbox,
//     on the main thread, so the writes below cannot race.
//  2. Every instance registers the same callbacks in the same order, so the
//     noop sandbox assigns them the same callback slots and hands us identical
//     trampoline pointers. Those trampolines recover the sandbox that is
//     currently executing on this thread from thread-local state, so a
//     callback still reaches the right instance.
//
// Registering different callbacks per instance, storing anything
// instance-specific here, or invoking hunspell off the main thread would each
// invalidate this. See security/rlbox/docs/index.md for the full rationale.

hunspell_create_filemgr_t* moz_glue_hunspell_create_filemgr = nullptr;
hunspell_get_line_t* moz_glue_hunspell_get_line = nullptr;
hunspell_get_line_num_t* moz_glue_hunspell_get_line_num = nullptr;
hunspell_destruct_filemgr_t* moz_glue_hunspell_destruct_filemgr = nullptr;
hunspell_ToUpperCase_t* moz_hunspell_ToUpperCase = nullptr;
hunspell_ToLowerCase_t* moz_hunspell_ToLowerCase = nullptr;
hunspell_get_current_cs_t* moz_hunspell_GetCurrentCS = nullptr;

void RegisterHunspellCallbacks(
    hunspell_create_filemgr_t* aHunspellCreateFilemgr,
    hunspell_get_line_t* aHunspellGetLine,
    hunspell_get_line_num_t* aHunspellGetLine_num,
    hunspell_destruct_filemgr_t* aHunspellDestructFilemgr,
    hunspell_ToUpperCase_t* aHunspellToUpperCase,
    hunspell_ToLowerCase_t* aHunspellToLowerCase,
    hunspell_get_current_cs_t* aHunspellGetCurrentCS) {
  moz_glue_hunspell_create_filemgr = aHunspellCreateFilemgr;
  moz_glue_hunspell_get_line = aHunspellGetLine;
  moz_glue_hunspell_get_line_num = aHunspellGetLine_num;
  moz_glue_hunspell_destruct_filemgr = aHunspellDestructFilemgr;
  moz_hunspell_ToUpperCase = aHunspellToUpperCase;
  moz_hunspell_ToLowerCase = aHunspellToLowerCase;
  moz_hunspell_GetCurrentCS = aHunspellGetCurrentCS;
}
