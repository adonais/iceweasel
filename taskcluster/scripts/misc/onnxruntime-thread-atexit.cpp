/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* onnxruntime links libstdc++ statically, which pulls in its
 * __cxa_thread_atexit. That is a bare forward to glibc's
 * __cxa_thread_atexit_impl, the only symbol in GLIBC_2.18, so the library ends
 * up needing a newer glibc than the 2.17 Firefox supports.
 *
 * build/unix/stdc++compat/stdc++compat.cpp solves this for Firefox's own
 * binaries by defining __cxa_thread_atexit_impl as a forward to libstdc++'s
 * __cxa_thread_atexit. That only works against a shared libstdc++, whose
 * __cxa_thread_atexit has its own fallback implementation; against a static one
 * the forward would call straight back into here.
 *
 * So provide a real implementation instead, taking the same approach libstdc++
 * itself does when glibc has no __cxa_thread_atexit_impl: keep a per-thread
 * stack of destructors and run it from a pthread key destructor.
 *
 * libstdc++ also registers that with atexit, so that the main thread's
 * destructors run too, as pthread key destructors are not called when it
 * returns from main or calls exit. This deliberately doesn't: running
 * destructors during shutdown is riskier than leaving them, and it doesn't
 * matter here, since onnxruntime is only ever called into from worker threads
 * and the process is going away regardless. */

#include <pthread.h>
#include <stdlib.h>

namespace {

struct DtorEntry {
  void (*mDtor)(void*);
  void* mObject;
  DtorEntry* mNext;
};

/* __thread rather than thread_local: this must not itself need thread_local
 * destructor support, or registering a destructor would recurse. */
__thread DtorEntry* sDtors = nullptr;

pthread_key_t sKey;
pthread_once_t sKeyOnce = PTHREAD_ONCE_INIT;

extern "C" void RunDtors(void*) {
  /* A destructor may register more destructors, so drain until empty rather
   * than walking the list that was present on entry. */
  while (sDtors) {
    DtorEntry* entry = sDtors;
    sDtors = entry->mNext;
    entry->mDtor(entry->mObject);
    free(entry);
  }
}

void CreateKey() { pthread_key_create(&sKey, RunDtors); }

}  // namespace

extern "C" __attribute__((visibility("hidden"))) int __cxa_thread_atexit_impl(
    void (*aDtor)(void*), void* aObject, void* aDsoHandle) {
  (void)aDsoHandle;

  if (pthread_once(&sKeyOnce, CreateKey) != 0) {
    return -1;
  }

  DtorEntry* entry = static_cast<DtorEntry*>(malloc(sizeof(DtorEntry)));
  if (!entry) {
    return -1;
  }

  /* The value is never read, it only has to be non-null for the key destructor
   * to be called when the thread exits. */
  if (pthread_setspecific(sKey, reinterpret_cast<void*>(1)) != 0) {
    free(entry);
    return -1;
  }

  /* Destructors run in reverse order of registration, so push to the front. */
  entry->mDtor = aDtor;
  entry->mObject = aObject;
  entry->mNext = sDtors;
  sDtors = entry;
  return 0;
}
