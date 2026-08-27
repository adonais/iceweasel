/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "RtpHeaderExtensions.h"

#include <string_view>

namespace mozilla {

bool RequiresTwoByteForm(const uint16_t aHeaderId,
                         const std::string_view aUri) {
  static constexpr std::string_view kTwoByteExtensions[] = {
      webrtc::RtpExtension::kDependencyDescriptorUri};
  if (aHeaderId >
      webrtc::RtpHeaderExtensionId::kOneByteHeaderExtensionMaxId.value()) {
    return true;
  }
  for (const auto& extUri : kTwoByteExtensions) {
    if (aUri == extUri) {
      return true;
    }
  }
  return false;
}
}  // namespace mozilla
