/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ComputePassEncoder.h"

#include "BindGroup.h"
#include "CommandEncoder.h"
#include "ComputePipeline.h"
#include "ExternalTexture.h"
#include "Utility.h"
#include "mozilla/dom/WebGPUBinding.h"
#include "mozilla/webgpu/ffi/wgpu.h"

namespace mozilla::webgpu {

GPU_IMPL_CYCLE_COLLECTION(ComputePassEncoder, mParent)
GPU_IMPL_JS_WRAP(ComputePassEncoder)

ComputePassEncoder::ComputePassEncoder(CommandEncoder* const aParent, RawId aId)
    : ObjectBase(aParent->GetChild(), aId,
                 ffi::wgpu_client_drop_compute_pass_encoder),
      ChildOf(aParent) {}

ComputePassEncoder::~ComputePassEncoder() = default;

void ComputePassEncoder::SetBindGroup(uint32_t aSlot,
                                      BindGroup* const aBindGroup,
                                      const uint32_t* aDynamicOffsets,
                                      size_t aDynamicOffsetsLength) {
  RawId bindGroup = 0;
  if (aBindGroup) {
    mUsedCanvasContexts.AppendElements(aBindGroup->GetCanvasContexts());
    mExternalTextures.AppendElements(aBindGroup->GetExternalTextures());
    bindGroup = aBindGroup->GetId();
  }
  ffi::wgpu_client_compute_pass_encoder_set_bind_group(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aSlot, bindGroup,
      {aDynamicOffsets, aDynamicOffsetsLength});
}

void ComputePassEncoder::SetBindGroup(
    uint32_t aSlot, BindGroup* const aBindGroup,
    const dom::Sequence<uint32_t>& aDynamicOffsets, ErrorResult& aRv) {
  this->SetBindGroup(aSlot, aBindGroup, aDynamicOffsets.Elements(),
                     aDynamicOffsets.Length());
}

void ComputePassEncoder::SetBindGroup(
    uint32_t aSlot, BindGroup* const aBindGroup,
    const dom::Uint32Array& aDynamicOffsetsData,
    uint64_t aDynamicOffsetsDataStart, uint64_t aDynamicOffsetsDataLength,
    ErrorResult& aRv) {
  auto dynamicOffsets =
      GetDynamicOffsetsFromArray(aDynamicOffsetsData, aDynamicOffsetsDataStart,
                                 aDynamicOffsetsDataLength, aRv);

  if (dynamicOffsets.isSome()) {
    this->SetBindGroup(aSlot, aBindGroup, dynamicOffsets->Elements(),
                       dynamicOffsets->Length());
  }
}

void ComputePassEncoder::SetPipeline(const ComputePipeline& aPipeline) {
  ffi::wgpu_client_compute_pass_encoder_set_pipeline(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aPipeline.GetId());
}

void ComputePassEncoder::DispatchWorkgroups(uint32_t workgroupCountX,
                                            uint32_t workgroupCountY,
                                            uint32_t workgroupCountZ) {
  ffi::wgpu_client_compute_pass_encoder_dispatch_workgroups(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), workgroupCountX,
      workgroupCountY, workgroupCountZ);
}

void ComputePassEncoder::DispatchWorkgroupsIndirect(
    const Buffer& aIndirectBuffer, uint64_t aIndirectOffset) {
  ffi::wgpu_client_compute_pass_encoder_dispatch_workgroups_indirect(
      GetClient(), mParent->GetDevice()->GetId(), GetId(),
      aIndirectBuffer.GetId(), aIndirectOffset);
}

void ComputePassEncoder::PushDebugGroup(const nsAString& aString) {
  const NS_ConvertUTF16toUTF8 utf8(aString);
  ffi::wgpu_client_compute_pass_encoder_push_debug_group(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), utf8.get());
}
void ComputePassEncoder::PopDebugGroup() {
  ffi::wgpu_client_compute_pass_encoder_pop_debug_group(
      GetClient(), mParent->GetDevice()->GetId(), GetId());
}
void ComputePassEncoder::InsertDebugMarker(const nsAString& aString) {
  const NS_ConvertUTF16toUTF8 utf8(aString);
  ffi::wgpu_client_compute_pass_encoder_insert_debug_marker(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), utf8.get());
}

void ComputePassEncoder::End() {
  mParent->EndComputePass(GetId(), mUsedCanvasContexts, mExternalTextures);
}

}  // namespace mozilla::webgpu
