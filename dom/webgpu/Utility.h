/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GPU_UTIL_H_
#define GPU_UTIL_H_

#include "mozilla/dom/TypedArray.h"
#include "mozilla/dom/WebGPUBinding.h"
#include "mozilla/webgpu/WebGPUTypes.h"
#include "mozilla/webgpu/ffi/wgpu.h"
#include "nsTArray.h"

namespace mozilla {
class ErrorResult;

namespace dom {
struct GPUComputePassDescriptor;
enum class PredefinedColorSpace : uint8_t;
template <typename T>
class Sequence;
using GPUExtent3D = RangeEnforcedUnsignedLongSequenceOrGPUExtent3DDict;
using OwningGPUExtent3D =
    OwningRangeEnforcedUnsignedLongSequenceOrGPUExtent3DDict;
}  // namespace dom
namespace webgpu {

void ConvertExtent3DToFFI(const dom::GPUExtent3D& aExtent,
                          ffi::WGPUExtent3d* aExtentFFI);

void ConvertExtent3DToFFI(const dom::OwningGPUExtent3D& aExtent,
                          ffi::WGPUExtent3d* aExtentFFI);

ffi::WGPUExtent3d ConvertExtent(const dom::GPUExtent3D& aExtent);

ffi::WGPUExtent3d ConvertExtent(const dom::OwningGPUExtent3D& aExtent);

ffi::WGPUCompareFunction ConvertCompareFunction(
    const dom::GPUCompareFunction& aCompare);

ffi::WGPUTextureFormat ConvertTextureFormat(
    const dom::GPUTextureFormat& aFormat);

ffi::WGPUTextureAspect ConvertTextureAspect(
    const dom::GPUTextureAspect& aAspect);

// Converts a `dom::GPUTextureDescriptor` into a
// `ffi::WGPUFfiTextureDescriptor`, owning the necessary temporary storage. The
// converted descriptor returned by `Get` is only valid for the lifetime of this
// object.
class MOZ_STACK_CLASS ConvertTextureDescriptor final {
 public:
  explicit ConvertTextureDescriptor(const dom::GPUTextureDescriptor& aDesc);

  ConvertTextureDescriptor(const ConvertTextureDescriptor&) = delete;
  ConvertTextureDescriptor& operator=(const ConvertTextureDescriptor&) = delete;

  const ffi::WGPUFfiTextureDescriptor* Get() const { return &mDesc; }

 private:
  StringHelper mLabel;
  AutoTArray<ffi::WGPUTextureFormat, 8> mViewFormats;
  ffi::WGPUFfiTextureDescriptor mDesc = {};
};

ffi::WGPUVertexFormat ConvertVertexFormat(const dom::GPUVertexFormat& aFormat);

ffi::WGPUMultisampleState ConvertMultisampleState(
    const dom::GPUMultisampleState& aDesc);

ffi::WGPUBlendComponent ConvertBlendComponent(
    const dom::GPUBlendComponent& aDesc);

ffi::WGPUStencilFaceState ConvertStencilFaceState(
    const dom::GPUStencilFaceState& aDesc);

ffi::WGPUDepthStencilState ConvertDepthStencilState(
    const dom::GPUDepthStencilState& aDesc);

ffi::WGPUPredefinedColorSpace ConvertPredefinedColorSpace(
    const dom::PredefinedColorSpace& aColorSpace);

mozilla::Maybe<mozilla::Buffer<uint32_t>> GetDynamicOffsetsFromArray(
    const dom::Uint32Array& aDynamicOffsetsData,
    uint64_t aDynamicOffsetsDataStart, uint64_t aDynamicOffsetsDataLength,
    ErrorResult& aRv);

}  // namespace webgpu
}  // namespace mozilla

#endif  // GPU_UTIL_H_
