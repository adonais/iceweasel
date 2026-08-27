/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBRTC_COMMON_RTPHEADEREXTENSIONS_H_
#define DOM_MEDIA_WEBRTC_COMMON_RTPHEADEREXTENSIONS_H_

#include <string_view>

#include "api/rtp_parameters.h"
namespace mozilla {
bool RequiresTwoByteForm(const uint16_t aHeaderId, const std::string_view aUri);
// Bug 2054612
// Add encapsulated list type which handles support and configuration logic for
// RTP header extensions.
}  // namespace mozilla

#endif
