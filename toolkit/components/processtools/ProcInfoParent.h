/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ProcInfoParent_h
#define mozilla_ProcInfoParent_h

#include "mozilla/PProcInfoParent.h"
#include "mozilla/ProcInfo.h"
#include "nsITimer.h"
#include "nsTArray.h"

namespace mozilla {

// Parent process side of PProcInfo. Lives on the main thread.
class ProcInfoParent final : public PProcInfoParent {
 public:
  NS_INLINE_DECL_REFCOUNTING(ProcInfoParent, override)

  using RemoteProcInfoPromise = MozPromise<RemoteProcInfo, nsresult, true>;

  // Binds a new actor to aEndpoint. The actor is kept alive until the channel
  // is closed.
  static already_AddRefed<ProcInfoParent> Create(
      ipc::Endpoint<PProcInfoParent>&& aEndpoint);

  // Returns the actor connected to the process with the given GeckoChildID, if
  // any.
  static ProcInfoParent* Get(GeckoChildID aChildID);

  void Shutdown();

  // Requests the child's system info (memory, CPU time and threads). Note that
  // as this information is self-reported from the child process it cannot be
  // trusted, and must be used accordingly.
  RefPtr<RemoteProcInfoPromise> GetProcInfo();

 private:
  explicit ProcInfoParent(GeckoChildID aChildID) : mChildID(aChildID) {}
  ~ProcInfoParent() = default;

  void ActorDestroy(ActorDestroyReason aWhy) override;

  const GeckoChildID mChildID;

  struct PendingRequest {
    RefPtr<RemoteProcInfoPromise::Private> mPromise;
    nsCOMPtr<nsITimer> mTimer;
  };
  // Pending calls to GetProcInfo() awaiting a response. When the child next
  // replies these will all be resolved with the result, if they have not yet
  // timed out.
  nsTArray<PendingRequest> mPendingRequests;
  // Whether we are awaiting a reply from the child. Used to avoid repeatedly
  // sending messages to a non-responsive child.
  bool mAwaitingReply = false;
};

}  // namespace mozilla

#endif
