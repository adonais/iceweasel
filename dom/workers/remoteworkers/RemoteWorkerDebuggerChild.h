/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_RemoteWorkerDebuggerChild_h
#define mozilla_dom_RemoteWorkerDebuggerChild_h

#include "mozilla/Maybe.h"
#include "mozilla/dom/PRemoteWorkerDebuggerChild.h"
#include "nsTArray.h"

using mozilla::ipc::IPCResult;

namespace mozilla::dom {

class WorkerPrivate;

class RemoteWorkerDebuggerChild final : public PRemoteWorkerDebuggerChild {
  friend class PRemoteWorkerDebuggerChild;
  friend class WorkerPrivate;

 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(RemoteWorkerDebuggerChild, final)

  explicit RemoteWorkerDebuggerChild(WorkerPrivate* aWorkerPrivate);

  mozilla::ipc::IPCResult RecvRegisterDone();
  mozilla::ipc::IPCResult RecvUnregisterDone();

  mozilla::ipc::IPCResult RecvInitialize(const nsString& aURL);
  mozilla::ipc::IPCResult RecvPostMessage(const nsString& aMessage);
  mozilla::ipc::IPCResult RecvSetDebuggerReady(const bool& aReady);

 private:
  ~RemoteWorkerDebuggerChild();

  void DispatchInitialize(const nsString& aURL);
  void DispatchMessageEvent(const nsString& aMessage);

  bool mIsInitialized{false};

  // The worker's main thread blocks in WorkerPrivate::EnableRemoteDebugger
  // until the parent acknowledges registration (RecvRegisterDone). The
  // debugger-script load triggered by Initialize spins a synchronous loop on
  // the worker thread that needs the (blocked) main thread to fetch the
  // script, so Initialize/PostMessage that arrive before registration is
  // acknowledged are buffered here and flushed from RecvRegisterDone, once the
  // main thread is no longer blocked. SetDebuggerReady is intentionally not
  // buffered so the debuggee stays paused until the client attaches.
  bool mRegisterDone{false};
  mozilla::Maybe<nsString> mPendingInitialize;
  nsTArray<nsString> mPendingMessages;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_RemoteWorkerDebuggerChild_h
