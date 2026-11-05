/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GPU_MAPPED_RANGE_GUARD_H_
#define GPU_MAPPED_RANGE_GUARD_H_

#include <cstdint>
#include <memory>
#include <span>

#include "mozilla/Maybe.h"
#include "mozilla/webgpu/WebGPUTypes.h"
#include "mozilla/webgpu/ffi/wgpu.h"

namespace mozilla::webgpu {

/* A range of a `GPUBuffer`'s contents made visible in the CPU's address space.
 *
 * Construct one of these by calling `WebGPUParent::LockMappedRange`,
 * or by calling `MappedRangeGuard::Create` directly if the
 * `WebGPUParent` is not available.
 *
 * The memory covered by `AsSpan()` is valid for as long as the
 * `MappedRangeGuard` is alive.
 *
 * `MappedRangeGuard` supports moves, but not copies.
 *
 * Take care to destroy `MappedRangeGuard` objects promptly. Unmapping
 * or destroying the buffer will block until the `MappedRangeGuard` is
 * destroyed. Such operations will deadlock if the thread trying to do
 * so is the very thread that owns the `MappedRangeGuard`. Note that
 * actions like device loss or teardown may attempt to destroy
 * buffers.
 */
class MappedRangeGuard {
 public:
  /* Request access to a given range of a mapped buffer.
   *
   * On success, return a `MappedRangeGuard` referring to the `aSize`
   * bytes at offset `aStart` within `aBufferId`. Call its `AsSpan`
   * method to get a `std::span` for the bytes.
   *
   * Any attempt to unmap or destroy the buffer will block until the
   * returned `MappedRangeGuard` is destroyed. This can cause
   * deadlock; see the class documentation for details.
   *
   * On failure, return `Nothing`.
   */
  static Maybe<MappedRangeGuard> Create(const ffi::WGPUGlobal* aGlobal,
                                        ffi::WGPUBufferId aBufferId,
                                        uint64_t aStart, uint64_t aSize);

  /* Return a span covering the requested range of the mapped buffer.
   * The returned span is valid only until `this` is destroyed.
   */
  std::span<uint8_t> AsSpan() const { return mSpan; }

 private:
  /* Private constructor, for the success case only. */
  explicit MappedRangeGuard(ffi::WGPUBufferMappingResult aSuccessfulMapping);

  /* A block of bytes containing the buffer contents. This is always
   * at least as long as the `aSize` passed to
   * `MappedRangeGuard::Create`, and points to valid memory until this
   * `MappedRangeGuard` is destroyed. */
  std::span<uint8_t> mSpan;

  /* A deleter class for `unique_ptr<ffi::WGPUBufferMapping>`. */
  struct WGPUBufferMappingDeleter {
    void operator()(ffi::WGPUBufferMapping* mapping) const noexcept;
  };

  /* The `wgpu_core::resource::BufferMapping` that owns the storage.
   * Its lifetime manages the lifetime of memory `mSpan` refers to.
   *
   * Using `unique_ptr` here means that `MappedRangeGuard` does not
   * support copy construction or assignment, and makes the default
   * move construction and assignment operators work correctly.
   */
  std::unique_ptr<ffi::WGPUBufferMapping, WGPUBufferMappingDeleter>
      mWgpuMapping;
};

}  // namespace mozilla::webgpu

#endif  // GPU_MAPPED_RANGE_GUARD_H_
