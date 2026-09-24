/*
 *  Copyright (c) 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

#ifndef API_RTP_HEADER_EXTENSION_ID_H_
#define API_RTP_HEADER_EXTENSION_ID_H_

#include "absl/strings/str_format.h"
#include "rtc_base/strong_alias.h"

namespace webrtc {

// This class represents the ID of an RTP header extension, as
// defined in RFC 8285 section 4.
// It is a number between 1 and 255, and needs to have a consistent
// association with an URI for all RTP packets in an RTP session,
// such as that defined by a BUNDLE.
// We allow the value 0 to mean "not set".
// TODO: bugs.webrtc.org/514817938 - change to underlying "uint8_t"
// once initialization prevents creation of illegal values.
class RtpHeaderExtensionId
    : public StrongAlias<class RtpHeaderExtensionIdTag, int> {
 public:
  static const RtpHeaderExtensionId kMinId;
  static const RtpHeaderExtensionId kMaxId;
  static const RtpHeaderExtensionId kOneByteHeaderExtensionMaxId;

  // Factory function for the NotSet value.
  static constexpr RtpHeaderExtensionId NotSet() {
    return RtpHeaderExtensionId();
  }

  // The default constructor makes a NotSet.
  constexpr RtpHeaderExtensionId() : StrongAlias(0) {}

  // TODO: bugs.webrtc.org/514817938 - enable these checks when tests fixed.
  //   RTC_DCHECK_GE(id, kMinId.value());
  //   RTC_DCHECK_LE(id, kMaxId.value());
  // }
  explicit constexpr RtpHeaderExtensionId(int id) : StrongAlias(id) {}

  // Returns true for an extension id that is set and is in the legal range.
  constexpr bool Valid() const {
    return value() >= kMinId.value() && value() <= kMaxId.value();
  }

  constexpr bool IsSet() const { return value() != 0; }

  template <typename Sink>
  friend void AbslStringify(Sink& sink, RtpHeaderExtensionId id) {
    absl::Format(&sink, "%d", id.value());
  }
};

inline constexpr RtpHeaderExtensionId RtpHeaderExtensionId::kMinId =
    RtpHeaderExtensionId(1);
inline constexpr RtpHeaderExtensionId RtpHeaderExtensionId::kMaxId =
    RtpHeaderExtensionId(255);
inline constexpr RtpHeaderExtensionId
    RtpHeaderExtensionId::kOneByteHeaderExtensionMaxId =
        RtpHeaderExtensionId(14);

}  // namespace webrtc

#endif  // API_RTP_HEADER_EXTENSION_ID_H_
