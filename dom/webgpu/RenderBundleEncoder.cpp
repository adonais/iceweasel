/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RenderBundleEncoder.h"

#include "BindGroup.h"
#include "Buffer.h"
#include "RenderBundle.h"
#include "RenderPipeline.h"
#include "Utility.h"
#include "mozilla/dom/WebGPUBinding.h"
#include "mozilla/webgpu/ffi/wgpu.h"

namespace mozilla::webgpu {

GPU_IMPL_CYCLE_COLLECTION(RenderBundleEncoder, mParent)
GPU_IMPL_JS_WRAP(RenderBundleEncoder)

RenderBundleEncoder::RenderBundleEncoder(Device* const aParent, RawId aId)
    : ObjectBase(aParent->GetChild(), aId,
                 ffi::wgpu_client_drop_render_bundle_encoder),
      ChildOf(aParent) {}

RenderBundleEncoder::~RenderBundleEncoder() = default;

void RenderBundleEncoder::SetBindGroup(uint32_t aSlot,
                                       BindGroup* const aBindGroup,
                                       const uint32_t* aDynamicOffsets,
                                       size_t aDynamicOffsetsLength) {
  RawId bindGroup = 0;
  if (aBindGroup) {
    mUsedCanvasContexts.AppendElements(aBindGroup->GetCanvasContexts());
    mExternalTextures.AppendElements(aBindGroup->GetExternalTextures());
    bindGroup = aBindGroup->GetId();
  }
  const ffi::WGPUFfiSlice_DynamicOffset dynamicOffsets{
      .data = aDynamicOffsets,
      .length = aDynamicOffsetsLength,
  };
  ffi::wgpu_client_render_bundle_encoder_set_bind_group(
      GetClient(), mParent->GetId(), GetId(), aSlot, bindGroup, dynamicOffsets);
}

void RenderBundleEncoder::SetBindGroup(
    uint32_t aSlot, BindGroup* const aBindGroup,
    const dom::Sequence<uint32_t>& aDynamicOffsets, ErrorResult& aRv) {
  this->SetBindGroup(aSlot, aBindGroup, aDynamicOffsets.Elements(),
                     aDynamicOffsets.Length());
}

void RenderBundleEncoder::SetBindGroup(
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

void RenderBundleEncoder::SetPipeline(const RenderPipeline& aPipeline) {
  ffi::wgpu_client_render_bundle_encoder_set_pipeline(
      GetClient(), mParent->GetId(), GetId(), aPipeline.GetId());
}

void RenderBundleEncoder::SetIndexBuffer(
    const Buffer& aBuffer, const dom::GPUIndexFormat& aIndexFormat,
    uint64_t aOffset, const dom::Optional<uint64_t>& aSize) {
  const auto iformat = aIndexFormat == dom::GPUIndexFormat::Uint32
                           ? ffi::WGPUIndexFormat_Uint32
                           : ffi::WGPUIndexFormat_Uint16;
  ffi::WGPUFfiOption_BufferAddress bufferSize = {};
  if (aSize.WasPassed()) {
    bufferSize.tag = ffi::WGPUFfiOption_BufferAddress_Some_BufferAddress;
    bufferSize.some = aSize.Value();
  } else {
    bufferSize.tag = ffi::WGPUFfiOption_BufferAddress_None_BufferAddress;
  }
  ffi::wgpu_client_render_bundle_encoder_set_index_buffer(
      GetClient(), mParent->GetId(), GetId(), aBuffer.GetId(), iformat, aOffset,
      bufferSize);
}

void RenderBundleEncoder::SetVertexBuffer(
    uint32_t aSlot, const Buffer* const aBuffer, uint64_t aOffset,
    const dom::Optional<uint64_t>& aSize) {
  RawId bufferId = 0;
  if (aBuffer) {
    bufferId = aBuffer->GetId();
  }
  ffi::WGPUFfiOption_BufferAddress bufferSize = {};
  if (aSize.WasPassed()) {
    bufferSize.tag = ffi::WGPUFfiOption_BufferAddress_Some_BufferAddress;
    bufferSize.some = aSize.Value();
  } else {
    bufferSize.tag = ffi::WGPUFfiOption_BufferAddress_None_BufferAddress;
  }
  ffi::wgpu_client_render_bundle_encoder_set_vertex_buffer(
      GetClient(), mParent->GetId(), GetId(), aSlot, bufferId, aOffset,
      bufferSize);
}

void RenderBundleEncoder::Draw(uint32_t aVertexCount, uint32_t aInstanceCount,
                               uint32_t aFirstVertex, uint32_t aFirstInstance) {
  ffi::wgpu_client_render_bundle_encoder_draw(
      GetClient(), mParent->GetId(), GetId(), aVertexCount, aInstanceCount,
      aFirstVertex, aFirstInstance);
}

void RenderBundleEncoder::DrawIndexed(uint32_t aIndexCount,
                                      uint32_t aInstanceCount,
                                      uint32_t aFirstIndex, int32_t aBaseVertex,
                                      uint32_t aFirstInstance) {
  ffi::wgpu_client_render_bundle_encoder_draw_indexed(
      GetClient(), mParent->GetId(), GetId(), aIndexCount, aInstanceCount,
      aFirstIndex, aBaseVertex, aFirstInstance);
}

void RenderBundleEncoder::DrawIndirect(const Buffer& aIndirectBuffer,
                                       uint64_t aIndirectOffset) {
  ffi::wgpu_client_render_bundle_encoder_draw_indirect(
      GetClient(), mParent->GetId(), GetId(), aIndirectBuffer.GetId(),
      aIndirectOffset);
}

void RenderBundleEncoder::DrawIndexedIndirect(const Buffer& aIndirectBuffer,
                                              uint64_t aIndirectOffset) {
  ffi::wgpu_client_render_bundle_encoder_draw_indexed_indirect(
      GetClient(), mParent->GetId(), GetId(), aIndirectBuffer.GetId(),
      aIndirectOffset);
}

void RenderBundleEncoder::PushDebugGroup(const nsAString& aString) {
  const NS_ConvertUTF16toUTF8 utf8(aString);
  ffi::wgpu_client_render_bundle_encoder_push_debug_group(
      GetClient(), mParent->GetId(), GetId(), utf8.get());
}
void RenderBundleEncoder::PopDebugGroup() {
  ffi::wgpu_client_render_bundle_encoder_pop_debug_group(
      GetClient(), mParent->GetId(), GetId());
}
void RenderBundleEncoder::InsertDebugMarker(const nsAString& aString) {
  const NS_ConvertUTF16toUTF8 utf8(aString);
  ffi::wgpu_client_render_bundle_encoder_insert_debug_marker(
      GetClient(), mParent->GetId(), GetId(), utf8.get());
}

already_AddRefed<RenderBundle> RenderBundleEncoder::Finish(
    const dom::GPURenderBundleDescriptor& aDesc) {
  ffi::WGPURenderBundleDescriptor desc = {};
  webgpu::StringHelper label(aDesc.mLabel);
  desc.label = label.Get();

  RawId id = ffi::wgpu_client_render_bundle_encoder_finish(
      GetClient(), mParent->GetId(), GetId(), &desc);

  auto canvasContexts = mUsedCanvasContexts.Clone();
  auto externalTextures = mExternalTextures.Clone();
  RefPtr<RenderBundle> bundle = new RenderBundle(
      mParent, id, std::move(canvasContexts), std::move(externalTextures));
  return bundle.forget();
}

}  // namespace mozilla::webgpu
