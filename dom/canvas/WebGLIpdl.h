/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WEBGLIPDL_H_
#define WEBGLIPDL_H_

#include "WebGLTypes.h"
#include "gfxTypes.h"
#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtils.h"
#include "mozilla/GfxMessageUtils.h"
#include "mozilla/dom/BindingIPCUtils.h"
#include "mozilla/ipc/Shmem.h"
#include "mozilla/layers/LayersSurfaces.h"

namespace mozilla {
namespace webgl {

// TODO: This should probably replace Shmem, or at least this should move to
// ipc/glue.

class RaiiShmem final {
  RefPtr<mozilla::ipc::ActorLifecycleProxy> mWeakRef;
  mozilla::ipc::Shmem mShmem = {};

 public:
  /// Returns zeroed data.
  static RaiiShmem Alloc(mozilla::ipc::IProtocol* const allocator,
                         const size_t size) {
    mozilla::ipc::Shmem shmem;
    if (!allocator->AllocShmem(size, &shmem)) return {};
    return {allocator, shmem};
  }

  static RaiiShmem AllocUnsafe(mozilla::ipc::IProtocol* const allocator,
                               const size_t size) {
    mozilla::ipc::Shmem shmem;
    if (!allocator->AllocUnsafeShmem(size, &shmem)) return {};
    return {allocator, shmem};
  }

  // -

  RaiiShmem() = default;

  RaiiShmem(mozilla::ipc::IProtocol* const allocator,
            const mozilla::ipc::Shmem& shmem) {
    if (!allocator || !allocator->CanSend()) {
      return;
    }

    // Shmems are handled by the top-level, so use that or we might leak after
    // the actor dies.
    mWeakRef = allocator->ToplevelProtocol()->GetLifecycleProxy();
    mShmem = shmem;
    if (!mWeakRef || !mWeakRef->Get() || !IsShmem()) {
      reset();
    }
  }

  void reset() {
    if (IsShmem()) {
      const auto& allocator = mWeakRef->Get();
      if (allocator) {
        allocator->DeallocShmem(mShmem);
      }
    }
    mWeakRef = nullptr;
    mShmem = {};
  }

  ~RaiiShmem() { reset(); }

  // -

  RaiiShmem(RaiiShmem&& rhs) { *this = std::move(rhs); }
  RaiiShmem& operator=(RaiiShmem&& rhs) {
    reset();
    mWeakRef = rhs.mWeakRef;
    mShmem = rhs.Extract();
    return *this;
  }

  // -

  bool IsShmem() const { return mShmem.IsReadable(); }

  explicit operator bool() const { return IsShmem(); }

  // -

  const auto& Shmem() const {
    MOZ_ASSERT(IsShmem());
    return mShmem;
  }

  Range<uint8_t> ByteRange() const {
    if (!IsShmem()) {
      return {};
    }
    return {mShmem.get<uint8_t>(), mShmem.Size<uint8_t>()};
  }

  mozilla::ipc::Shmem Extract() {
    auto ret = mShmem;
    mShmem = {};
    reset();
    return ret;
  }
};

using Int32Vector = std::vector<int32_t>;

}  // namespace webgl
}  // namespace mozilla

namespace IPC {

template <>
struct ParamTraits<mozilla::webgl::FrontBufferSnapshotIpc> final {
  using T = mozilla::webgl::FrontBufferSnapshotIpc;

  static void Write(IPC::MessageWriter* const writer, T& in) {
    WriteParam(writer, in.surfSize);
    WriteParam(writer, in.byteStride);
    WriteParam(writer, std::move(in.shmem));
  }

  static bool Read(IPC::MessageReader* const reader, T* const out) {
    return ReadParam(reader, &out->surfSize) &&
           ReadParam(reader, &out->byteStride) &&
           ReadParam(reader, &out->shmem);
  }
};

// -

template <>
struct ParamTraits<mozilla::webgl::ReadPixelsResultIpc> final {
  using T = mozilla::webgl::ReadPixelsResultIpc;

  static void Write(MessageWriter* const writer, T&& in) {
    WriteParam(writer, in.subrect);
    WriteParam(writer, in.byteStride);
    WriteParam(writer, std::move(in.shmem));
  }

  static bool Read(MessageReader* const reader, T* const out) {
    return ReadParam(reader, &out->subrect) &&
           ReadParam(reader, &out->byteStride) &&
           ReadParam(reader, &out->shmem);
  }
};

// -

template <>
struct ParamTraits<mozilla::webgl::TexUnpackBlobDesc> final {
  using T = mozilla::webgl::TexUnpackBlobDesc;

  static void Write(MessageWriter* const writer, T&& in) {
    WriteParam(writer, in.imageTarget);
    WriteParam(writer, in.size);
    WriteParam(writer, in.srcAlphaType);
    MOZ_RELEASE_ASSERT(!in.cpuData);
    MOZ_RELEASE_ASSERT(!in.pboOffset);
    WriteParam(writer, in.structuredSrcSize);
    MOZ_RELEASE_ASSERT(!in.image);
    WriteParam(writer, std::move(in.sd));
    MOZ_RELEASE_ASSERT(!in.sourceSurf);
    WriteParam(writer, in.unpacking);
    WriteParam(writer, in.applyUnpackTransforms);
  }

  static bool Read(MessageReader* const reader, T* const out) {
    return ReadParam(reader, &out->imageTarget) &&
           ReadParam(reader, &out->size) &&
           ReadParam(reader, &out->srcAlphaType) &&
           ReadParam(reader, &out->structuredSrcSize) &&
           ReadParam(reader, &out->sd) && ReadParam(reader, &out->unpacking) &&
           ReadParam(reader, &out->applyUnpackTransforms);
  }
};

// -

template <class U, size_t PaddedSize>
struct ParamTraits<mozilla::webgl::Padded<U, PaddedSize>> final {
  using T = mozilla::webgl::Padded<U, PaddedSize>;

  static void Write(MessageWriter* const writer, const T& in) {
    WriteParam(writer, *in);
  }

  static bool Read(MessageReader* const reader, T* const out) {
    return ReadParam(reader, &**out);
  }
};

// -

template <>
struct ParamTraits<mozilla::webgl::AttribBaseType>
    : public ContiguousEnumSerializerInclusive<
          mozilla::webgl::AttribBaseType,
          mozilla::webgl::AttribBaseType::Boolean,
          mozilla::webgl::AttribBaseType::Uint> {};

template <>
struct ParamTraits<mozilla::webgl::ContextLossReason>
    : public ContiguousEnumSerializerInclusive<
          mozilla::webgl::ContextLossReason,
          mozilla::webgl::ContextLossReason::None,
          mozilla::webgl::ContextLossReason::Guilty> {};

template <>
struct ParamTraits<gfxAlphaType>
    : public ContiguousEnumSerializerInclusive<
          gfxAlphaType, gfxAlphaType::Opaque, gfxAlphaType::NonPremult> {};

template <>
struct ParamTraits<mozilla::dom::WebGLPowerPreference> final
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::WebGLPowerPreference> {};

template <>
struct ParamTraits<mozilla::dom::PredefinedColorSpace> final
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::PredefinedColorSpace> {};

template <>
struct ParamTraits<mozilla::webgl::OptionalRenderableFormatBits> final
    : public BitFlagsEnumSerializer<
          mozilla::webgl::OptionalRenderableFormatBits,
          mozilla::webgl::kAllOptionalRenderableFormatBits> {};

// -
// ParamTraits_TiedFields

template <>
struct ParamTraits<mozilla::webgl::InitContextDesc> final
    : public ParamTraits_TiedFields<mozilla::webgl::InitContextDesc> {};

template <>
struct ParamTraits<mozilla::WebGLContextOptions> final
    : public ParamTraits_TiedFields<mozilla::WebGLContextOptions> {};

template <>
struct ParamTraits<mozilla::webgl::OpaqueFramebufferOptions> final
    : public ParamTraits_TiedFields<mozilla::webgl::OpaqueFramebufferOptions> {
};

template <>
struct ParamTraits<mozilla::webgl::ShaderPrecisionFormat> final
    : public ParamTraits_TiedFields<mozilla::webgl::ShaderPrecisionFormat> {};

// -

template <>
struct ParamTraits<mozilla::gl::GLVendor>
    : public ContiguousEnumSerializerInclusive<mozilla::gl::GLVendor,
                                               mozilla::gl::GLVendor::Intel,
                                               mozilla::gl::kHighestGLVendor> {
};

template <typename U>
struct ParamTraits<mozilla::webgl::EnumMask<U>> final
    : public ParamTraits_TiedFields<mozilla::webgl::EnumMask<U>> {};

template <>
struct ParamTraits<mozilla::webgl::InitContextResult> final
    : public ParamTraits_TiedFields<mozilla::webgl::InitContextResult> {};

template <>
struct ParamTraits<mozilla::webgl::Limits> final
    : public ParamTraits_TiedFields<mozilla::webgl::Limits> {};

template <>
struct ParamTraits<mozilla::webgl::PixelPackingState> final
    : public ParamTraits_TiedFields<mozilla::webgl::PixelPackingState> {};
template <>
struct ParamTraits<mozilla::webgl::PixelUnpackStateWebgl> final
    : public ParamTraits_TiedFields<mozilla::webgl::PixelUnpackStateWebgl> {};

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::ReadPixelsDesc, srcOffset,
                                  size, pi, packState);

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::PackingInfo, format, type);

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::CompileResult, pending, log,
                                  translatedSource, success);

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::LinkResult, pending, log,
                                  success, active, tfBufferMode);

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::LinkActiveInfo, activeAttribs,
                                  activeUniforms, activeUniformBlocks,
                                  activeTfVaryings);

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::ActiveInfo, elemType,
                                  elemCount, name);

// -

DEFINE_IPC_SERIALIZER_WITH_SUPER_CLASS_AND_FIELDS(
    mozilla::webgl::ActiveAttribInfo, mozilla::webgl::ActiveInfo, location,
    baseType);

// -

DEFINE_IPC_SERIALIZER_WITH_SUPER_CLASS_AND_FIELDS(
    mozilla::webgl::ActiveUniformInfo, mozilla::webgl::ActiveInfo, locByIndex,
    block_index, block_offset, block_arrayStride, block_matrixStride,
    block_isRowMajor);

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::ActiveUniformBlockInfo, name,
                                  dataSize, activeUniformIndices,
                                  referencedByVertexShader,
                                  referencedByFragmentShader);

// -

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::webgl::GetUniformData, data, type);

// -

template <typename U>
struct ParamTraits<mozilla::avec2<U>>
    : ParamTraits_TiedFields<mozilla::avec2<U>> {};

// -

template <typename U>
struct ParamTraits<mozilla::avec3<U>>
    : ParamTraits_TiedFields<mozilla::avec3<U>> {};

}  // namespace IPC

#endif
