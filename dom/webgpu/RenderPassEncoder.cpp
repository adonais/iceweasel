/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RenderPassEncoder.h"

#include "BindGroup.h"
#include "CommandEncoder.h"
#include "ExternalTexture.h"
#include "RenderBundle.h"
#include "RenderPipeline.h"
#include "TextureView.h"
#include "Utility.h"
#include "mozilla/dom/WebGPUBinding.h"
#include "mozilla/webgpu/ffi/wgpu.h"

namespace mozilla::webgpu {

GPU_IMPL_CYCLE_COLLECTION(RenderPassEncoder, mParent)
GPU_IMPL_JS_WRAP(RenderPassEncoder)

static ffi::WGPUStoreOp ConvertStoreOp(const dom::GPUStoreOp& aOp) {
  switch (aOp) {
    case dom::GPUStoreOp::Store:
      return ffi::WGPUStoreOp_Store;
    case dom::GPUStoreOp::Discard:
      return ffi::WGPUStoreOp_Discard;
  }
  MOZ_CRASH("bad GPUStoreOp");
}

static ffi::WGPUColor ConvertColor(const dom::Sequence<double>& aSeq) {
  ffi::WGPUColor color{
      .r = aSeq.SafeElementAt(0, 0.0),
      .g = aSeq.SafeElementAt(1, 0.0),
      .b = aSeq.SafeElementAt(2, 0.0),
      .a = aSeq.SafeElementAt(3, 1.0),
  };
  return color;
}

static ffi::WGPUColor ConvertColor(const dom::GPUColorDict& aColor) {
  ffi::WGPUColor color = {aColor.mR, aColor.mG, aColor.mB, aColor.mA};
  return color;
}

static ffi::WGPUColor ConvertColor(
    const dom::DoubleSequenceOrGPUColorDict& aColor) {
  if (aColor.IsDoubleSequence()) {
    return ConvertColor(aColor.GetAsDoubleSequence());
  }
  if (aColor.IsGPUColorDict()) {
    return ConvertColor(aColor.GetAsGPUColorDict());
  }
  MOZ_ASSERT_UNREACHABLE(
      "Unexpected dom::DoubleSequenceOrGPUColorDict variant");
  return ffi::WGPUColor();
}
static ffi::WGPUColor ConvertColor(
    const dom::OwningDoubleSequenceOrGPUColorDict& aColor) {
  if (aColor.IsDoubleSequence()) {
    return ConvertColor(aColor.GetAsDoubleSequence());
  }
  if (aColor.IsGPUColorDict()) {
    return ConvertColor(aColor.GetAsGPUColorDict());
  }
  MOZ_ASSERT_UNREACHABLE(
      "Unexpected dom::OwningDoubleSequenceOrGPUColorDict variant");
  return ffi::WGPUColor();
}

RawId BeginFfiRenderPass(ffi::WGPUClient* aClient, RawId aDeviceId,
                         RawId aEncoderId,
                         const dom::GPURenderPassDescriptor& aDesc) {
  ffi::WGPURenderPassDescriptor desc = {};

  webgpu::StringHelper label(aDesc.mLabel);
  desc.label = label.Get();

  ffi::WGPURenderPassDepthStencilAttachment dsDesc = {};
  if (aDesc.mDepthStencilAttachment.WasPassed()) {
    const auto& dsa = aDesc.mDepthStencilAttachment.Value();
    // NOTE: We're assuming callers reified this to be a view.
    dsDesc.view = dsa.mView.GetAsGPUTextureView()->GetId();

    // -

    if (dsa.mDepthLoadOp.WasPassed()) {
      dsDesc.depth.load_op.tag =
          ffi::WGPUFfiOption_LoadOp_FfiOption_f32_Some_LoadOp_FfiOption_f32;
      switch (dsa.mDepthLoadOp.Value()) {
        case dom::GPULoadOp::Load:
          dsDesc.depth.load_op.some.tag =
              ffi::WGPULoadOp_FfiOption_f32_Load_FfiOption_f32;
          break;
        case dom::GPULoadOp::Clear:
          dsDesc.depth.load_op.some.clear_tag =
              ffi::WGPULoadOp_FfiOption_f32_Clear_FfiOption_f32;
          if (dsa.mDepthClearValue.WasPassed()) {
            dsDesc.depth.load_op.some.clear.tag =
                ffi::WGPUFfiOption_f32_Some_f32;
            dsDesc.depth.load_op.some.clear.some = dsa.mDepthClearValue.Value();
          } else {
            dsDesc.depth.load_op.some.clear.tag =
                ffi::WGPUFfiOption_f32_None_f32;
          }
          break;
      }
    } else {
      dsDesc.depth.load_op.tag =
          ffi::WGPUFfiOption_LoadOp_FfiOption_f32_None_LoadOp_FfiOption_f32;
    }

    if (dsa.mDepthStoreOp.WasPassed()) {
      dsDesc.depth.store_op.tag = ffi::WGPUFfiOption_StoreOp_Some_StoreOp;
      dsDesc.depth.store_op.some = ConvertStoreOp(dsa.mDepthStoreOp.Value());
    } else {
      dsDesc.depth.store_op.tag = ffi::WGPUFfiOption_StoreOp_None_StoreOp;
    }

    dsDesc.depth.read_only = dsa.mDepthReadOnly;

    // -

    if (dsa.mStencilLoadOp.WasPassed()) {
      dsDesc.stencil.load_op.tag =
          ffi::WGPUFfiOption_LoadOp_FfiOption_u32_Some_LoadOp_FfiOption_u32;
      switch (dsa.mStencilLoadOp.Value()) {
        case dom::GPULoadOp::Load:
          dsDesc.stencil.load_op.some.tag =
              ffi::WGPULoadOp_FfiOption_u32_Load_FfiOption_u32;
          break;
        case dom::GPULoadOp::Clear:
          dsDesc.stencil.load_op.some.clear_tag =
              ffi::WGPULoadOp_FfiOption_u32_Clear_FfiOption_u32;
          dsDesc.stencil.load_op.some.clear.tag =
              ffi::WGPUFfiOption_u32_Some_u32;
          dsDesc.stencil.load_op.some.clear.some = dsa.mStencilClearValue;
          break;
      }
    } else {
      dsDesc.stencil.load_op.tag =
          ffi::WGPUFfiOption_LoadOp_FfiOption_u32_None_LoadOp_FfiOption_u32;
    }

    if (dsa.mStencilStoreOp.WasPassed()) {
      dsDesc.stencil.store_op.tag = ffi::WGPUFfiOption_StoreOp_Some_StoreOp;
      dsDesc.stencil.store_op.some =
          ConvertStoreOp(dsa.mStencilStoreOp.Value());
    } else {
      dsDesc.stencil.store_op.tag = ffi::WGPUFfiOption_StoreOp_None_StoreOp;
    }

    dsDesc.stencil.read_only = dsa.mStencilReadOnly;

    // -

    desc.depth_stencil_attachment = &dsDesc;
  }

  AutoTArray<ffi::WGPUFfiOption_FfiRenderPassColorAttachment,
             WGPUMAX_COLOR_ATTACHMENTS>
      colorDescs;

  for (const auto& caOrNull : aDesc.mColorAttachments) {
    ffi::WGPUFfiOption_FfiRenderPassColorAttachment opt = {};
    if (caOrNull.IsNull()) {
      opt.tag = ffi::
          WGPUFfiOption_FfiRenderPassColorAttachment_None_FfiRenderPassColorAttachment;
      colorDescs.AppendElement(opt);
      continue;
    }
    const auto& ca = caOrNull.Value();
    ffi::WGPUFfiRenderPassColorAttachment cd = {};
    // NOTE: We're assuming callers reified this to be a view.
    cd.view = ca.mView.GetAsGPUTextureView()->GetId();
    cd.store_op = ConvertStoreOp(ca.mStoreOp);

    if (ca.mDepthSlice.WasPassed()) {
      cd.depth_slice.tag = ffi::WGPUFfiOption_u32_Some_u32;
      cd.depth_slice.some = ca.mDepthSlice.Value();
    } else {
      cd.depth_slice.tag = ffi::WGPUFfiOption_u32_None_u32;
    }
    if (ca.mResolveTarget.WasPassed()) {
      // NOTE: We're assuming callers reified this to be a view.
      cd.resolve_target =
          ca.mResolveTarget.Value().GetAsGPUTextureView()->GetId();
    }

    switch (ca.mLoadOp) {
      case dom::GPULoadOp::Load:
        cd.load_op.tag = ffi::WGPULoadOp_Color_Load_Color;
        break;
      case dom::GPULoadOp::Clear:
        cd.load_op.clear_tag = ffi::WGPULoadOp_Color_Clear_Color;
        if (ca.mClearValue.WasPassed()) {
          cd.load_op.clear = ConvertColor(ca.mClearValue.Value());
        } else {
          cd.load_op.clear = ffi::WGPUColor{0};
        }
        break;
    }
    opt.tag = ffi::
        WGPUFfiOption_FfiRenderPassColorAttachment_Some_FfiRenderPassColorAttachment;
    opt.some = cd;
    colorDescs.AppendElement(opt);
  }

  desc.color_attachments = {colorDescs.Elements(), colorDescs.Length()};

  if (aDesc.mOcclusionQuerySet.WasPassed()) {
    desc.occlusion_query_set = aDesc.mOcclusionQuerySet.Value().GetId();
  }

  ffi::WGPUPassTimestampWrites passTimestampWrites = {};
  if (aDesc.mTimestampWrites.WasPassed()) {
    AssignPassTimestampWrites(aDesc.mTimestampWrites.Value(),
                              passTimestampWrites);
    desc.timestamp_writes = &passTimestampWrites;
  }

  return ffi::wgpu_client_command_encoder_begin_render_pass(aClient, aDeviceId,
                                                            aEncoderId, &desc);
}

RenderPassEncoder::RenderPassEncoder(CommandEncoder* const aParent, RawId aId)
    : ObjectBase(aParent->GetChild(), aId,
                 ffi::wgpu_client_drop_render_pass_encoder),
      ChildOf(aParent) {}

RenderPassEncoder::~RenderPassEncoder() = default;

void RenderPassEncoder::SetBindGroup(uint32_t aSlot,
                                     BindGroup* const aBindGroup,
                                     const uint32_t* aDynamicOffsets,
                                     size_t aDynamicOffsetsLength) {
  RawId bindGroup = 0;
  if (aBindGroup) {
    mUsedCanvasContexts.AppendElements(aBindGroup->GetCanvasContexts());
    mExternalTextures.AppendElements(aBindGroup->GetExternalTextures());
    bindGroup = aBindGroup->GetId();
  }
  ffi::wgpu_client_render_pass_encoder_set_bind_group(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aSlot, bindGroup,
      {aDynamicOffsets, aDynamicOffsetsLength});
}

void RenderPassEncoder::SetBindGroup(
    uint32_t aSlot, BindGroup* const aBindGroup,
    const dom::Sequence<uint32_t>& aDynamicOffsets, ErrorResult& aRv) {
  this->SetBindGroup(aSlot, aBindGroup, aDynamicOffsets.Elements(),
                     aDynamicOffsets.Length());
}

void RenderPassEncoder::SetBindGroup(
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

void RenderPassEncoder::SetPipeline(const RenderPipeline& aPipeline) {
  ffi::wgpu_client_render_pass_encoder_set_pipeline(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aPipeline.GetId());
}

void RenderPassEncoder::SetIndexBuffer(const Buffer& aBuffer,
                                       const dom::GPUIndexFormat& aIndexFormat,
                                       uint64_t aOffset,
                                       const dom::Optional<uint64_t>& aSize) {
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
  ffi::wgpu_client_render_pass_encoder_set_index_buffer(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aBuffer.GetId(),
      iformat, aOffset, bufferSize);
}

void RenderPassEncoder::SetVertexBuffer(uint32_t aSlot,
                                        const Buffer* const aBuffer,
                                        uint64_t aOffset,
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
  ffi::wgpu_client_render_pass_encoder_set_vertex_buffer(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aSlot, bufferId,
      aOffset, bufferSize);
}

void RenderPassEncoder::Draw(uint32_t aVertexCount, uint32_t aInstanceCount,
                             uint32_t aFirstVertex, uint32_t aFirstInstance) {
  ffi::wgpu_client_render_pass_encoder_draw(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aVertexCount,
      aInstanceCount, aFirstVertex, aFirstInstance);
}

void RenderPassEncoder::DrawIndexed(uint32_t aIndexCount,
                                    uint32_t aInstanceCount,
                                    uint32_t aFirstIndex, int32_t aBaseVertex,
                                    uint32_t aFirstInstance) {
  ffi::wgpu_client_render_pass_encoder_draw_indexed(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aIndexCount,
      aInstanceCount, aFirstIndex, aBaseVertex, aFirstInstance);
}

void RenderPassEncoder::DrawIndirect(const Buffer& aIndirectBuffer,
                                     uint64_t aIndirectOffset) {
  ffi::wgpu_client_render_pass_encoder_draw_indirect(
      GetClient(), mParent->GetDevice()->GetId(), GetId(),
      aIndirectBuffer.GetId(), aIndirectOffset);
}

void RenderPassEncoder::DrawIndexedIndirect(const Buffer& aIndirectBuffer,
                                            uint64_t aIndirectOffset) {
  ffi::wgpu_client_render_pass_encoder_draw_indexed_indirect(
      GetClient(), mParent->GetDevice()->GetId(), GetId(),
      aIndirectBuffer.GetId(), aIndirectOffset);
}

void RenderPassEncoder::SetViewport(float x, float y, float width, float height,
                                    float minDepth, float maxDepth) {
  ffi::wgpu_client_render_pass_encoder_set_viewport(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), x, y, width, height,
      minDepth, maxDepth);
}

void RenderPassEncoder::SetScissorRect(uint32_t x, uint32_t y, uint32_t width,
                                       uint32_t height) {
  ffi::wgpu_client_render_pass_encoder_set_scissor_rect(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), x, y, width, height);
}

void RenderPassEncoder::SetBlendConstant(
    const dom::DoubleSequenceOrGPUColorDict& color) {
  ffi::WGPUColor aColor = ConvertColor(color);
  ffi::wgpu_client_render_pass_encoder_set_blend_constant(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), &aColor);
}

void RenderPassEncoder::SetStencilReference(uint32_t reference) {
  ffi::wgpu_client_render_pass_encoder_set_stencil_reference(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), reference);
}

void RenderPassEncoder::BeginOcclusionQuery(uint32_t aQueryIndex) {
  ffi::wgpu_client_render_pass_encoder_begin_occlusion_query(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), aQueryIndex);
}

void RenderPassEncoder::EndOcclusionQuery() {
  ffi::wgpu_client_render_pass_encoder_end_occlusion_query(
      GetClient(), mParent->GetDevice()->GetId(), GetId());
}

void RenderPassEncoder::ExecuteBundles(
    const dom::Sequence<OwningNonNull<RenderBundle>>& aBundles) {
  nsTArray<ffi::WGPURenderBundleId> renderBundles(aBundles.Length());
  for (const auto& bundle : aBundles) {
    mUsedCanvasContexts.AppendElements(bundle->GetCanvasContexts());
    mExternalTextures.AppendElements(bundle->GetExternalTextures());
    renderBundles.AppendElement(bundle->GetId());
  }
  ffi::wgpu_client_render_pass_encoder_execute_bundles(
      GetClient(), mParent->GetDevice()->GetId(), GetId(),
      {renderBundles.Elements(), renderBundles.Length()});
}

void RenderPassEncoder::PushDebugGroup(const nsAString& aString) {
  const NS_ConvertUTF16toUTF8 utf8(aString);
  ffi::wgpu_client_render_pass_encoder_push_debug_group(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), utf8.get());
}
void RenderPassEncoder::PopDebugGroup() {
  ffi::wgpu_client_render_pass_encoder_pop_debug_group(
      GetClient(), mParent->GetDevice()->GetId(), GetId());
}
void RenderPassEncoder::InsertDebugMarker(const nsAString& aString) {
  const NS_ConvertUTF16toUTF8 utf8(aString);
  ffi::wgpu_client_render_pass_encoder_insert_debug_marker(
      GetClient(), mParent->GetDevice()->GetId(), GetId(), utf8.get());
}

void RenderPassEncoder::End() {
  mParent->EndRenderPass(GetId(), mUsedCanvasContexts, mExternalTextures);
}

}  // namespace mozilla::webgpu
