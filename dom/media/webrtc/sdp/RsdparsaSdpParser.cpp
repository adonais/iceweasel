/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/RsdparsaSdpParser.h"

#include <memory>

#include "mozilla/UniquePtr.h"
#include "nsError.h"
#include "nsString.h"
#include "sdp/RsdparsaSdp.h"
#include "sdp/RsdparsaSdpGlue.h"
#include "sdp/RsdparsaSdpInc.h"
#include "sdp/Sdp.h"

namespace mozilla {

namespace ffi = mozilla::sdp::ffi;

const std::string& RsdparsaSdpParser::ParserName() {
  static const std::string& WEBRTC_SDP_NAME = "WEBRTCSDP";
  return WEBRTC_SDP_NAME;
}

UniquePtr<SdpParser::Results> RsdparsaSdpParser::Parse(
    const std::string& aText) {
  UniquePtr<SdpParser::InternalResults> results =
      std::make_unique<SdpParser::InternalResults>(Name());
  const ffi::SdpSession* result = nullptr;
  const ffi::SdpParserError* err = nullptr;
  ffi::StringView sdpTextView{reinterpret_cast<const uint8_t*>(aText.data()),
                              aText.length()};
  nsresult rv = parse_sdp(sdpTextView, false, &result, &err);
  if (rv != NS_OK) {
    size_t line = sdp_get_error_line_num(const_cast<ffi::SdpParserError*>(err));
    nsAutoCString errMsg;
    sdp_get_error_message(err, &errMsg);
    sdp_free_error(const_cast<ffi::SdpParserError*>(err));
    results->AddParseError(line, std::string(errMsg.get(), errMsg.Length()));
    return results;
  }

  if (err) {
    size_t line = sdp_get_error_line_num(const_cast<ffi::SdpParserError*>(err));
    nsAutoCString warningMsg;
    sdp_get_error_message(err, &warningMsg);
    results->AddParseWarning(
        line, std::string(warningMsg.get(), warningMsg.Length()));
    sdp_free_error(const_cast<ffi::SdpParserError*>(err));
  }

  RsdparsaSessionHandle uniqueResult(const_cast<ffi::SdpSession*>(result));
  ffi::RustSdpOrigin rustOrigin = sdp_get_origin(uniqueResult.get());
  auto address = convertExplicitlyTypedAddress(rustOrigin.addr);
  SdpOrigin origin(std::string(convertStringView(rustOrigin.username)),
                   rustOrigin.session_id, rustOrigin.session_version,
                   address.first, address.second);

  auto sdp = MakeUnique<RsdparsaSdp>(std::move(uniqueResult), origin);

  // Bug 2072767 - synthesize an error for unknown media types. The Sdp is left
  // unset on purpose: media.peerconnection.sdp.strict_success defaults to
  // false, so HybridSdpParser counts any result carrying an Sdp as a success
  // and would hand this one to JSEP regardless of the error.
  const auto levels = sdp->GetMediaSectionCount();
  bool found = false;
  for (size_t level = 0; level < levels; level++) {
    const auto& info = sdp->GetMediaSection(level).GetMediaTypeInfo();
    if (info.type == SdpMediaSection::kUnknown) {
      ffi::StringView view{reinterpret_cast<const uint8_t*>(aText.data()),
                           aText.length()};
      const auto line = sdp_get_media_section_line_number(view, level);
      results->AddParseError(line,
                             "unsupported media value: " + info.unknown->name);
      found = true;
    }
  }
  if (!found) {
    results->SetSdp(std::move(sdp));
  }

  return results;
}

bool RsdparsaSdpParser::IsNamed(const std::string& aName) {
  return aName == ParserName();
}

}  // namespace mozilla
