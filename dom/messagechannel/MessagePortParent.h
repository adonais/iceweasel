/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MessagePortParent_h
#define mozilla_dom_MessagePortParent_h

#include "mozilla/WeakPtr.h"
#include "mozilla/dom/PMessagePortParent.h"
#include "mozilla/dom/SharedMessageBody.h"

namespace mozilla::dom {

class MessagePortService;

class MessagePortParent final : public PMessagePortParent,
                                public SupportsWeakPtr {
  friend class PMessagePortParent;

  NS_INLINE_DECL_REFCOUNTING(MessagePortParent, override)

 public:
  explicit MessagePortParent(const nsID& aUUID);

  bool Entangle(const nsID& aDestinationUUID, const uint32_t& aSequenceID);

  bool Entangled(nsTArray<NotNull<RefPtr<SharedMessageBody>>>&& aMessages);

  void Close();
  void CloseAndDelete();

  bool CanSendData() const { return mCanSendData; }

  const nsID& ID() const { return mUUID; }

  static bool ForceClose(const nsID& aUUID, const nsID& aDestinationUUID,
                         const uint32_t& aSequenceID);

 private:
  ~MessagePortParent();

  mozilla::ipc::IPCResult RecvPostMessages(
      nsTArray<NotNull<RefPtr<SharedMessageBody>>>&& aMessages);

  mozilla::ipc::IPCResult RecvDisentangle(
      nsTArray<NotNull<RefPtr<SharedMessageBody>>>&& aMessages);

  mozilla::ipc::IPCResult RecvStopSendingData();

  mozilla::ipc::IPCResult RecvClose();

  virtual void ActorDestroy(ActorDestroyReason aWhy) override;

  RefPtr<MessagePortService> mService;
  const nsID mUUID;
  bool mEntangled;
  bool mCanSendData;
  // Messages received via PostMessages before Entangled() has been called.
  // Flushed when entangling completes.
  nsTArray<NotNull<RefPtr<SharedMessageBody>>> mPendingMessages;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_MessagePortParent_h
