/* -*- Mode: C++; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebGPUChild.h"

#include <utility>

#include "Adapter.h"
#include "CompilationInfo.h"
#include "DeviceLostInfo.h"
#include "PipelineLayout.h"
#include "Sampler.h"
#include "Utility.h"
#include "js/RootingAPI.h"
#include "js/String.h"
#include "js/TypeDecls.h"
#include "js/Value.h"
#include "js/Warnings.h"  // JS::WarnUTF8
#include "mozilla/Assertions.h"
#include "mozilla/Attributes.h"
#include "mozilla/EnumTypeTraits.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/dom/GPUUncapturedErrorEvent.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/ScriptSettings.h"
#include "mozilla/dom/WebGPUBinding.h"
#include "mozilla/webgpu/ComputePipeline.h"
#include "mozilla/webgpu/InternalError.h"
#include "mozilla/webgpu/OutOfMemoryError.h"
#include "mozilla/webgpu/PipelineError.h"
#include "mozilla/webgpu/RenderPipeline.h"
#include "mozilla/webgpu/ValidationError.h"
#include "mozilla/webgpu/WebGPUTypes.h"
#include "mozilla/webgpu/ffi/wgpu.h"

namespace mozilla::webgpu {

NS_IMPL_CYCLE_COLLECTION(WebGPUChild)

void WebGPUChild::JsWarning(nsIGlobalObject* aGlobal,
                            const nsACString& aMessage) {
  const auto& flatString = PromiseFlatCString(aMessage);
  if (aGlobal) {
    dom::AutoJSAPI api;
    if (api.Init(aGlobal)) {
      JS::WarnUTF8(api.cx(), "Uncaptured WebGPU error: %s", flatString.get());
    }
  } else {
    printf_stderr("Uncaptured WebGPU error without device target: %s\n",
                  flatString.get());
  }
}

void on_message_queued(ffi::WGPUWebGPUChildPtr child) {
  auto* c = static_cast<WebGPUChild*>(child);
  c->ScheduleFlushQueuedMessages();
}

WebGPUChild::WebGPUChild()
    : mClient(ffi::wgpu_client_new(this, on_message_queued)) {}

WebGPUChild::~WebGPUChild() = default;

RawId WebGPUChild::RenderBundleEncoderFinish(
    ffi::WGPURenderBundleEncoder& aEncoder, RawId aDeviceId,
    const dom::GPURenderBundleDescriptor& aDesc) {
  ffi::WGPURenderBundleDescriptor desc = {};

  webgpu::StringHelper label(aDesc.mLabel);
  desc.label = label.Get();

  RawId id = ffi::wgpu_client_create_render_bundle(GetClient(), aDeviceId,
                                                   &aEncoder, &desc);

  return id;
}

RawId WebGPUChild::RenderBundleEncoderFinishError(RawId aDeviceId,
                                                  const nsString& aLabel) {
  webgpu::StringHelper label(aLabel);

  RawId id = ffi::wgpu_client_create_render_bundle_error(GetClient(), aDeviceId,
                                                         label.Get());

  return id;
}

namespace ffi {
void wgpu_child_resolve_request_adapter_promise(
    WGPUWebGPUChildPtr aChild, RawId aAdapterId,
    const struct WGPUAdapterInformation* aAdapterInfo) {
  auto* c = static_cast<WebGPUChild*>(aChild);
  auto& pending_promises = c->mPendingRequestAdapterPromises;
  auto pending_promise = std::move(pending_promises.front());
  pending_promises.pop_front();

  MOZ_RELEASE_ASSERT(pending_promise.adapter_id == aAdapterId);

  if (aAdapterInfo == nullptr) {
    pending_promise.promise->MaybeResolve(JS::NullHandleValue);
  } else {
    auto info = std::make_shared<WGPUAdapterInformation>(*aAdapterInfo);
    RefPtr<Adapter> adapter = new Adapter(pending_promise.instance, c, info);
    pending_promise.promise->MaybeResolve(adapter);
  }
}

void wgpu_child_resolve_request_device_promise(WGPUWebGPUChildPtr aChild,
                                               RawId aDeviceId, RawId aQueueId,
                                               const nsCString* aError) {
  auto* c = static_cast<WebGPUChild*>(aChild);
  auto& pending_promises = c->mPendingRequestDevicePromises;
  auto pending_promise = std::move(pending_promises.front());
  pending_promises.pop_front();

  MOZ_RELEASE_ASSERT(pending_promise.device_id == aDeviceId);
  MOZ_RELEASE_ASSERT(pending_promise.queue_id == aQueueId);

  if (aError == nullptr) {
    RefPtr<Device> device =
        new Device(pending_promise.adapter, pending_promise.device_id,
                   pending_promise.queue_id, pending_promise.features,
                   pending_promise.limits, pending_promise.adapter_info,
                   pending_promise.lost_promise);
    device->SetLabel(pending_promise.label);
    pending_promise.promise->MaybeResolve(device);
  } else {
    pending_promise.promise->MaybeRejectWithOperationError(*aError);
  }
}

void wgpu_child_resolve_pop_error_scope_promise(WGPUWebGPUChildPtr aChild,
                                                RawId aDeviceId, uint8_t aTy,
                                                const nsCString* aMessage) {
  auto* c = static_cast<WebGPUChild*>(aChild);
  auto& pending_promises = c->mPendingPopErrorScopePromises;
  auto pending_promise = std::move(pending_promises.front());
  pending_promises.pop_front();

  MOZ_RELEASE_ASSERT(pending_promise.device->GetId() == aDeviceId);

  RefPtr<Error> error;

  switch ((PopErrorScopeResultType)aTy) {
    case PopErrorScopeResultType::NoError:
      pending_promise.promise->MaybeResolve(JS::NullHandleValue);
      return;

    case PopErrorScopeResultType::DeviceLost:
      pending_promise.promise->MaybeResolve(JS::NullHandleValue);
      return;

    case PopErrorScopeResultType::ThrowOperationError:
      pending_promise.promise->MaybeRejectWithOperationError(*aMessage);
      return;

    case PopErrorScopeResultType::OutOfMemory:
      error = new OutOfMemoryError(pending_promise.device->GetParentObject(),
                                   *aMessage);
      break;

    case PopErrorScopeResultType::ValidationError:
      error = new ValidationError(pending_promise.device->GetParentObject(),
                                  *aMessage);
      break;

    case PopErrorScopeResultType::InternalError:
      error = new InternalError(pending_promise.device->GetParentObject(),
                                *aMessage);
      break;
  }
  pending_promise.promise->MaybeResolve(std::move(error));
}

void wgpu_child_resolve_create_pipeline_promise(WGPUWebGPUChildPtr aChild,
                                                RawId aPipelineId,
                                                bool aIsRenderPipeline,
                                                bool aIsValidationError,
                                                const nsCString* aError) {
  auto* c = static_cast<WebGPUChild*>(aChild);
  auto& pending_promises = c->mPendingCreatePipelinePromises;
  auto pending_promise = std::move(pending_promises.front());
  pending_promises.pop_front();

  MOZ_RELEASE_ASSERT(pending_promise.pipeline_id == aPipelineId);
  MOZ_RELEASE_ASSERT(pending_promise.is_render_pipeline == aIsRenderPipeline);

  if (aError == nullptr) {
    if (pending_promise.is_render_pipeline) {
      RefPtr<RenderPipeline> object = new RenderPipeline(
          pending_promise.device, pending_promise.pipeline_id);
      object->SetLabel(pending_promise.label);
      pending_promise.promise->MaybeResolve(object);
    } else {
      RefPtr<ComputePipeline> object = new ComputePipeline(
          pending_promise.device, pending_promise.pipeline_id);
      object->SetLabel(pending_promise.label);
      pending_promise.promise->MaybeResolve(object);
    }
  } else {
    dom::GPUPipelineErrorReason reason;
    if (aIsValidationError) {
      reason = dom::GPUPipelineErrorReason::Validation;
    } else {
      reason = dom::GPUPipelineErrorReason::Internal;
    }
    RefPtr<PipelineError> e = new PipelineError(*aError, reason);
    pending_promise.promise->MaybeReject(e);
  }
}

void wgpu_child_resolve_create_shader_module_promise(
    WGPUWebGPUChildPtr aChild, RawId aShaderModuleId,
    struct WGPUFfiSlice_FfiShaderModuleCompilationMessage aMessages) {
  auto* c = static_cast<WebGPUChild*>(aChild);
  auto& pending_promises = c->mPendingCreateShaderModulePromises;
  auto pending_promise = std::move(pending_promises.front());
  pending_promises.pop_front();

  MOZ_RELEASE_ASSERT(pending_promise.shader_module->mId == aShaderModuleId);

  auto ffi_messages = Span(aMessages.data, aMessages.length);

  auto messages = nsTArray<WebGPUCompilationMessage>(aMessages.length);
  for (const auto& message : ffi_messages) {
    WebGPUCompilationMessage msg;
    msg.lineNum = message.line_number;
    msg.linePos = message.line_pos;
    msg.offset = message.utf16_offset;
    msg.length = message.utf16_length;
    msg.message = message.message;
    // wgpu currently only returns errors.
    msg.messageType = WebGPUCompilationMessageType::Error;
    messages.AppendElement(std::move(msg));
  }

  if (!messages.IsEmpty()) {
    auto shader_module = pending_promise.shader_module;
    reportCompilationMessagesToConsole(shader_module, std::cref(messages));
  }
  RefPtr<CompilationInfo> infoObject(
      new CompilationInfo(pending_promise.device));
  infoObject->SetMessages(messages);
  pending_promise.promise->MaybeResolve(infoObject);
};

void wgpu_child_resolve_buffer_map_promise(WGPUWebGPUChildPtr aChild,
                                           WGPUBufferId aBufferId,
                                           bool aIsWritable, uint64_t aOffset,
                                           uint64_t aSize,
                                           const nsCString* aError) {
  auto* c = static_cast<WebGPUChild*>(aChild);
  auto& pending_promises = c->mPendingBufferMapPromises;

  WebGPUChild::PendingBufferMapPromise pending_promise;
  if (auto search = pending_promises.find(aBufferId);
      search != pending_promises.end()) {
    pending_promise = std::move(search->second.front());
    search->second.pop_front();

    if (search->second.empty()) {
      pending_promises.erase(aBufferId);
    }
  } else {
    NS_ERROR("Missing pending promise for buffer map");
  }

  // Unmap might have been called while the result was on the way back.
  if (pending_promise.promise->State() != dom::Promise::PromiseState::Pending) {
    return;
  }

  if (aError == nullptr) {
    pending_promise.buffer->ResolveMapRequest(pending_promise.promise, aOffset,
                                              aSize, aIsWritable);
  } else {
    pending_promise.buffer->RejectMapRequest(pending_promise.promise, *aError);
  }
}

void wgpu_child_resolve_on_submitted_work_done_promise(
    WGPUWebGPUChildPtr aChild, WGPUQueueId aQueueId) {
  auto* c = static_cast<WebGPUChild*>(aChild);
  const auto& it = c->mPendingOnSubmittedWorkDonePromises.find(aQueueId);
  MOZ_RELEASE_ASSERT(it != c->mPendingOnSubmittedWorkDonePromises.end());
  auto& pending_promises = it->second;
  auto pending_promise = std::move(pending_promises.front());
  pending_promises.pop_front();

  if (pending_promises.empty()) {
    c->mPendingOnSubmittedWorkDonePromises.erase(it);
  }

  pending_promise->MaybeResolveWithUndefined();
};
}  // namespace ffi

ipc::IPCResult WebGPUChild::RecvServerMessage(const ipc::ByteBuf& aByteBuf) {
  ffi::wgpu_client_receive_server_message(GetClient(), ToFFI(&aByteBuf));
  return IPC_OK();
}

void WebGPUChild::ScheduleFlushQueuedMessages() {
  if (mScheduledFlushQueuedMessages) {
    return;
  }
  mScheduledFlushQueuedMessages = true;

  nsContentUtils::RunInStableState(
      NewRunnableMethod("dom::WebGPUChild::ScheduledFlushQueuedMessages", this,
                        &WebGPUChild::ScheduledFlushQueuedMessages));
}

size_t WebGPUChild::QueueDataBuffer(ipc::ByteBuf&& bb) {
  auto buffer_index = mQueuedDataBuffers.Length();
  mQueuedDataBuffers.AppendElement(std::move(bb));
  return buffer_index;
}

size_t WebGPUChild::QueueShmemHandle(ipc::MutableSharedMemoryHandle&& handle) {
  auto shmem_handle_index = mQueuedHandles.Length();
  mQueuedHandles.AppendElement(std::move(handle));
  return shmem_handle_index;
}

void WebGPUChild::ScheduledFlushQueuedMessages() {
  MOZ_ASSERT(mScheduledFlushQueuedMessages);
  mScheduledFlushQueuedMessages = false;

  PROFILER_MARKER_UNTYPED("WebGPU: ScheduledFlushQueuedMessages",
                          GRAPHICS_WebGPU);
  FlushQueuedMessages();
}

void WebGPUChild::FlushQueuedMessages() {
  ipc::ByteBuf serialized_messages;
  auto nr_of_messages = ffi::wgpu_client_get_queued_messages(
      GetClient(), ToFFI(&serialized_messages));
  if (nr_of_messages == 0) {
    return;
  }

  PROFILER_MARKER_FMT("WebGPU: FlushQueuedMessages", GRAPHICS_WebGPU, {},
                      "messages: {}", nr_of_messages);

  bool sent =
      SendMessages(nr_of_messages, std::move(serialized_messages),
                   std::move(mQueuedDataBuffers), std::move(mQueuedHandles));
  mQueuedDataBuffers.Clear();
  mQueuedHandles.Clear();

  if (!sent) {
    ClearActorState();
  }
}

ipc::IPCResult WebGPUChild::RecvUncapturedError(RawId aDeviceId,
                                                const nsACString& aMessage) {
  RefPtr<Device> device;
  if (aDeviceId) {
    const auto itr = mDeviceMap.find(aDeviceId);
    if (itr != mDeviceMap.end()) {
      device = itr->second.get();
    }
  }
  // We don't want to spam the errors to the console indefinitely
  if (device->CheckNewWarning(aMessage)) {
    JsWarning(device->GetOwnerGlobal(), aMessage);

    dom::GPUUncapturedErrorEventInit init;
    init.mError = new ValidationError(device->GetParentObject(), aMessage);
    RefPtr<mozilla::dom::GPUUncapturedErrorEvent> event =
        dom::GPUUncapturedErrorEvent::Constructor(device, u"uncapturederror"_ns,
                                                  init);
    device->DispatchEvent(*event);
  }
  return IPC_OK();
}

ipc::IPCResult WebGPUChild::RecvDeviceLost(RawId aDeviceId, uint8_t aReason,
                                           const nsACString& aMessage) {
  // There might have been a race between getting back the response to a
  // `device.destroy()` call and actual device loss. If that was the case,
  // set the lost reason to "destroyed".
  auto device_lost_promise_entry =
      mPendingDeviceLostPromises.extract(aDeviceId);
  if (!device_lost_promise_entry.empty()) {
    auto promise = std::move(device_lost_promise_entry.mapped());
    RefPtr<DeviceLostInfo> info = new DeviceLostInfo(
        promise->GetParentObject(), dom::GPUDeviceLostReason::Destroyed,
        u"Device destroyed"_ns);
    promise->MaybeResolve(info);
  } else {
    auto message = NS_ConvertUTF8toUTF16(aMessage);

    const auto itr = mDeviceMap.find(aDeviceId);
    if (itr != mDeviceMap.end()) {
      auto* device = itr->second.get();

      dom::GPUDeviceLostReason reason =
          static_cast<dom::GPUDeviceLostReason>(aReason);
      device->ResolveLost(reason, message);
    }
  }

  return IPC_OK();
}

void WebGPUChild::SwapChainPresent(RawId aTextureId,
                                   const RemoteTextureId& aRemoteTextureId,
                                   const RemoteTextureOwnerId& aOwnerId) {
  // The parent side needs to create a command encoder which will be submitted
  // and dropped right away so we create and release an encoder ID here.
  RawId commandEncoderId =
      ffi::wgpu_client_make_command_encoder_id(GetClient());
  RawId commandBufferId = ffi::wgpu_client_make_command_buffer_id(GetClient());
  ffi::wgpu_client_swap_chain_present(GetClient(), aTextureId, commandEncoderId,
                                      commandBufferId, aRemoteTextureId.mId,
                                      aOwnerId.mId);
  ffi::wgpu_client_free_command_encoder_id(GetClient(), commandEncoderId);
  ffi::wgpu_client_free_command_buffer_id(GetClient(), commandBufferId);
}

void WebGPUChild::RegisterDevice(Device* const aDevice) {
  mDeviceMap.insert({aDevice->mId, aDevice});
}

void WebGPUChild::UnregisterDevice(RawId aDeviceId) {
  ffi::wgpu_client_drop_device(GetClient(), aDeviceId);

  mDeviceMap.erase(aDeviceId);
}

void WebGPUChild::ActorDestroy(ActorDestroyReason) { ClearActorState(); }

void WebGPUChild::ClearActorState() {
  // All following code sections resolve/reject promises immediately. JS code
  // can perform further calls that add more promises to data structures, so
  // all code sections below should not use iterators!

  // Make sure we resolve/reject all pending promises; even the ones that get
  // enqueued immediately by JS code that gets to run as a result of a promise
  // we just resolved/rejected.
  while (true) {
    // Resolve the promise with null since the WebGPUChild has been destroyed.
    if (!mPendingRequestAdapterPromises.empty()) {
      auto pending_promise = std::move(mPendingRequestAdapterPromises.front());
      mPendingRequestAdapterPromises.pop_front();

      pending_promise.promise->MaybeResolve(JS::NullHandleValue);
    }
    // Pretend this worked but return a lost device, per spec.
    else if (!mPendingRequestDevicePromises.empty()) {
      auto pending_promise = std::move(mPendingRequestDevicePromises.front());
      mPendingRequestDevicePromises.pop_front();

      RefPtr<Device> device =
          new Device(pending_promise.adapter, pending_promise.device_id,
                     pending_promise.queue_id, pending_promise.features,
                     pending_promise.limits, pending_promise.adapter_info,
                     pending_promise.lost_promise);
      device->SetLabel(pending_promise.label);
      device->ResolveLost(dom::GPUDeviceLostReason::Unknown,
                          u"WebGPUChild destroyed"_ns);
      pending_promise.promise->MaybeResolve(device);
    }
    // Resolve all promises that were pending due to `device.destroy()` being
    // called.
    else if (!mPendingDeviceLostPromises.empty()) {
      auto pending_promise_entry = mPendingDeviceLostPromises.begin();
      auto pending_promise = std::move(pending_promise_entry->second);
      mPendingDeviceLostPromises.erase(pending_promise_entry->first);

      RefPtr<DeviceLostInfo> info = new DeviceLostInfo(
          pending_promise->GetParentObject(),
          dom::GPUDeviceLostReason::Destroyed, u"Device destroyed"_ns);
      pending_promise->MaybeResolve(info);
    }
    // Empty device map and resolve all lost promises with an "unknown" reason.
    else if (!mDeviceMap.empty()) {
      auto device_map_entry = mDeviceMap.begin();
      auto device = std::move(device_map_entry->second);
      mDeviceMap.erase(device_map_entry->first);

      device->ResolveLost(dom::GPUDeviceLostReason::Unknown,
                          u"WebGPUChild destroyed"_ns);
    }
    // Pretend this worked and there is no error, per spec.
    else if (!mPendingPopErrorScopePromises.empty()) {
      auto pending_promise = std::move(mPendingPopErrorScopePromises.front());
      mPendingPopErrorScopePromises.pop_front();

      pending_promise.promise->MaybeResolve(JS::NullHandleValue);
    }
    // Pretend this worked, per spec; see "Listen for timeline event".
    else if (!mPendingCreatePipelinePromises.empty()) {
      auto pending_promise = std::move(mPendingCreatePipelinePromises.front());
      mPendingCreatePipelinePromises.pop_front();

      if (pending_promise.is_render_pipeline) {
        RefPtr<RenderPipeline> object = new RenderPipeline(
            pending_promise.device, pending_promise.pipeline_id);
        object->SetLabel(pending_promise.label);
        pending_promise.promise->MaybeResolve(object);
      } else {
        RefPtr<ComputePipeline> object = new ComputePipeline(
            pending_promise.device, pending_promise.pipeline_id);
        object->SetLabel(pending_promise.label);
        pending_promise.promise->MaybeResolve(object);
      }
    }
    // Pretend this worked, per spec; see "Listen for timeline event".
    else if (!mPendingCreateShaderModulePromises.empty()) {
      auto pending_promise =
          std::move(mPendingCreateShaderModulePromises.front());
      mPendingCreateShaderModulePromises.pop_front();

      nsTArray<WebGPUCompilationMessage> messages;
      RefPtr<CompilationInfo> infoObject(
          new CompilationInfo(pending_promise.device));
      infoObject->SetMessages(messages);
      pending_promise.promise->MaybeResolve(infoObject);
    }
    // Reject the promise as if unmap() has been called, per spec.
    else if (!mPendingBufferMapPromises.empty()) {
      auto pending_promises = mPendingBufferMapPromises.begin();
      auto pending_promise = std::move(pending_promises->second.front());
      pending_promises->second.pop_front();
      if (pending_promises->second.empty()) {
        mPendingBufferMapPromises.erase(pending_promises->first);
      }

      // Unmap might have been called.
      if (pending_promise.promise->State() !=
          dom::Promise::PromiseState::Pending) {
        continue;
      }
      pending_promise.buffer->RejectMapRequestWithAbortError(
          pending_promise.promise);
    }
    // Pretend this worked, per spec; see "Listen for timeline event".
    else if (auto it = mPendingOnSubmittedWorkDonePromises.begin();
             it != mPendingOnSubmittedWorkDonePromises.end()) {
      auto& pending_promises = it->second;
      MOZ_ASSERT(!pending_promises.empty(),
                 "Empty queues should have been removed from the map");

      auto pending_promise = std::move(pending_promises.front());
      pending_promises.pop_front();

      if (pending_promises.empty()) {
        mPendingOnSubmittedWorkDonePromises.erase(it);
      }

      pending_promise->MaybeResolveWithUndefined();
    } else {
      break;
    }
  }
}

void WebGPUChild::QueueSubmit(RawId aSelfId, RawId aDeviceId,
                              nsTArray<RawId>& aCommandBuffers) {
  ffi::wgpu_client_queue_submit(
      GetClient(), aDeviceId, aSelfId,
      {aCommandBuffers.Elements(), aCommandBuffers.Length()},
      {mSwapChainTexturesWaitingForSubmit.Elements(),
       mSwapChainTexturesWaitingForSubmit.Length()});
  mSwapChainTexturesWaitingForSubmit.Clear();

  PROFILER_MARKER_UNTYPED("WebGPU: QueueSubmit", GRAPHICS_WebGPU);
  FlushQueuedMessages();
}

void WebGPUChild::NotifyWaitForSubmit(RawId aTextureId) {
  mSwapChainTexturesWaitingForSubmit.AppendElement(aTextureId);
}

}  // namespace mozilla::webgpu
