/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MappedRangeGuard.h"

namespace mozilla::webgpu {

/* static */
Maybe<MappedRangeGuard> MappedRangeGuard::Create(const ffi::WGPUGlobal* aGlobal,
                                                 ffi::WGPUBufferId aBufferId,
                                                 uint64_t aStart,
                                                 uint64_t aSize) {
  const auto mappingResult = ffi::wgpu_server_buffer_get_mapped_range(
      aGlobal, aBufferId, aStart, aSize);
  if (!mappingResult.core_mapping) return Nothing();

  // Getting the range *did* succeed, right?
  MOZ_RELEASE_ASSERT(mappingResult.ptr != nullptr);
  MOZ_RELEASE_ASSERT(mappingResult.length >= aSize);

  return Some(MappedRangeGuard(mappingResult));
}

MappedRangeGuard::MappedRangeGuard(
    ffi::WGPUBufferMappingResult aSuccessfulMapping)
    : mSpan(std::span(aSuccessfulMapping.ptr, aSuccessfulMapping.length)),
      mWgpuMapping(aSuccessfulMapping.core_mapping) {}

void MappedRangeGuard::WGPUBufferMappingDeleter::operator()(
    ffi::WGPUBufferMapping* mapping) const noexcept {
  ffi::wgpu_server_buffer_mapping_destroy(mapping);
}

}  // namespace mozilla::webgpu
