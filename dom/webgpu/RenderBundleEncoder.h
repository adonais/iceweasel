/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GPU_RenderBundleEncoder_H_
#define GPU_RenderBundleEncoder_H_

#include "CanvasContext.h"
#include "ObjectModel.h"
#include "mozilla/dom/TypedArray.h"

namespace mozilla::dom {
struct GPURenderBundleEncoderDescriptor;
struct GPURenderBundleDescriptor;
enum class GPUIndexFormat : uint8_t;
}  // namespace mozilla::dom

namespace mozilla::webgpu {
class BindGroup;
class Buffer;
class RenderPipeline;
class Device;
class RenderBundle;
class ExternalTexture;

class RenderBundleEncoder final : public nsWrapperCache,
                                  public ObjectBase,
                                  public ChildOf<Device> {
 public:
  GPU_DECL_CYCLE_COLLECTION(RenderBundleEncoder)
  GPU_DECL_JS_WRAP(RenderBundleEncoder)

  RenderBundleEncoder(Device* const aParent, RawId aId);

 private:
  virtual ~RenderBundleEncoder();

  // The canvas contexts of any canvas textures used in bind groups of this
  // render bundle.
  CanvasContextArray mUsedCanvasContexts;
  nsTArray<RefPtr<ExternalTexture>> mExternalTextures;

 private:
  void SetBindGroup(uint32_t aSlot, BindGroup* const aBindGroup,
                    const uint32_t* aDynamicOffsets,
                    size_t aDynamicOffsetsLength);

 public:
  void SetBindGroup(uint32_t aSlot, BindGroup* const aBindGroup,
                    const dom::Sequence<uint32_t>& aDynamicOffsets,
                    ErrorResult& aRv);
  void SetBindGroup(uint32_t aSlot, BindGroup* const aBindGroup,
                    const dom::Uint32Array& aDynamicOffsetsData,
                    uint64_t aDynamicOffsetsDataStart,
                    uint64_t aDynamicOffsetsDataLength, ErrorResult& aRv);
  // render encoder base
  void SetPipeline(const RenderPipeline& aPipeline);
  void SetIndexBuffer(const Buffer& aBuffer,
                      const dom::GPUIndexFormat& aIndexFormat, uint64_t aOffset,
                      const dom::Optional<uint64_t>& aSize);
  void SetVertexBuffer(uint32_t aSlot, const Buffer* const aBuffer,
                       uint64_t aOffset, const dom::Optional<uint64_t>& aSize);
  void Draw(uint32_t aVertexCount, uint32_t aInstanceCount,
            uint32_t aFirstVertex, uint32_t aFirstInstance);
  void DrawIndexed(uint32_t aIndexCount, uint32_t aInstanceCount,
                   uint32_t aFirstIndex, int32_t aBaseVertex,
                   uint32_t aFirstInstance);
  void DrawIndirect(const Buffer& aIndirectBuffer, uint64_t aIndirectOffset);
  void DrawIndexedIndirect(const Buffer& aIndirectBuffer,
                           uint64_t aIndirectOffset);

  void PushDebugGroup(const nsAString& aString);
  void PopDebugGroup();
  void InsertDebugMarker(const nsAString& aString);

  // self
  already_AddRefed<RenderBundle> Finish(
      const dom::GPURenderBundleDescriptor& aDesc);

  // helpers not defined by WebGPU
  mozilla::Span<const WeakPtr<CanvasContext>> GetCanvasContexts() const {
    return mUsedCanvasContexts;
  }

  mozilla::Span<const RefPtr<ExternalTexture>> GetExternalTextures() const {
    return mExternalTextures;
  }
};

}  // namespace mozilla::webgpu

#endif  // GPU_RenderBundleEncoder_H_
