/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_hwinference_TextGenerationChild_h
#define mozilla_hwinference_TextGenerationChild_h

#include <functional>

#include "mozilla/Atomics.h"
#include "nsIThread.h"
#include "mozilla/hwinference/PTextGenerationChild.h"
#include "mozilla/ipc/FileDescriptor.h"

namespace mozilla::llama {
class LlamaBackend;
}

namespace mozilla::hwinference {

// Utility-process side of one text generator, driving a LlamaBackend on a
// thread of its own: generators share nothing, and run in parallel.
class TextGenerationChild final : public PTextGenerationChild {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(TextGenerationChild, override);

  TextGenerationChild(const ipc::FileDescriptor& aModel,
                      const TextGenerationOptions& aOptions);

  // Call once the actor is bound; reports the load outcome with Ready.
  void Initialize();

  mozilla::ipc::IPCResult RecvGenerate(GenerateRequest&& aRequest,
                                       GenerateResolver&& aResolve);
  mozilla::ipc::IPCResult RecvClear();
  mozilla::ipc::IPCResult RecvCancel();

  void ActorDestroy(ActorDestroyReason aReason) override;

 private:
  friend PTextGenerationChild;
  class Generation;

  ~TextGenerationChild();

  // Runs on mGenerationThread.
  LoadResult LoadOnThread();

  // Always dispatches to the utility main thread; skipped after actor teardown.
  void DispatchToActorThread(const char* aName, std::function<void()>&& aFn);

  ipc::FileDescriptor mModel;
  const TextGenerationOptions mOptions;

  // Model work and conversation history are confined to this thread.
  const nsCOMPtr<nsIThread> mGenerationThread;
  // The utility main thread owns IPC; it never runs the backend.
  const nsCOMPtr<nsISerialEventTarget> mActorThread;

  // mGenerationThread only.
  RefPtr<llama::LlamaBackend> mBackend;
  nsCString mLoadError;
  nsTArray<ChatMessage> mHistory;

  // Actor thread only.
  RefPtr<Generation> mCurrentGeneration;

  Atomic<bool> mShutdown{false};
};

}  // namespace mozilla::hwinference

#endif  // mozilla_hwinference_TextGenerationChild_h
