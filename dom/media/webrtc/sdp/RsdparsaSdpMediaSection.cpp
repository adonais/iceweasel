/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "sdp/RsdparsaSdpMediaSection.h"

#include "mozilla/Assertions.h"
#include "sdp/RsdparsaSdpGlue.h"
#include "sdp/RsdparsaSdpInc.h"
#include "sdp/SdpMediaSectionImpl.h"

namespace mozilla {

namespace ffi = mozilla::sdp::ffi;
using ffi::RustSdpConnection;
using ffi::RustSdpFormatType;
using ffi::RustSdpMediaValue;
using ffi::RustSdpProtocolValue;
using ffi::StringView;

auto RsdparsaSdpMediaSection::GetSection() const -> RustMediaSection* {
  auto* section = sdp_get_media_section(mSession.get(), GetLevel());
  MOZ_RELEASE_ASSERT(section);
  return section;
}

UniquePtr<SdpAttributeListImpl> RsdparsaSdpMediaSection::CreateAttributeList(
    const RsdparsaSessionHandle& session, size_t level,
    const RsdparsaSdpAttributeList* sessionLevel) {
  auto* section = sdp_get_media_section(session.get(), level);
  MOZ_RELEASE_ASSERT(section);
  RsdparsaSessionHandle attributeSession(sdp_new_reference(session.get()));
  return UniquePtr<SdpAttributeListImpl>(new RsdparsaSdpAttributeList(
      std::move(attributeSession), section, sessionLevel));
}

RsdparsaSdpMediaSection::RsdparsaSdpMediaSection(
    size_t level, RsdparsaSessionHandle session,
    const RsdparsaSdpAttributeList* sessionLevel)
    : SdpMediaSectionImpl(level,
                          CreateAttributeList(session, level, sessionLevel)),
      mSession(std::move(session)) {
  switch (sdp_rust_get_media_type(GetSection())) {
    case RustSdpMediaValue::Audio:
      mMediaTypeInfo = {.type = kAudio};
      break;
    case RustSdpMediaValue::Video:
      mMediaTypeInfo = {.type = kVideo};
      break;
    case RustSdpMediaValue::Application:
      mMediaTypeInfo = {.type = kApplication};
      break;
    case RustSdpMediaValue::Unknown:
      mMediaTypeInfo = {
          .type = kUnknown,
          .unknown = Some(UnknownMediaTypeData{
              .name = std::string(convertStringView(
                  sdp_get_unknown_media_type_name(GetSection()))),
              .formatString = std::string(convertStringView(
                  sdp_get_unknown_format_string(GetSection())))})};
      break;
  }

  LoadPort();
  LoadProtocol();
  LoadFormats();
  LoadConnection();
  LoadBandwidths();
}

void RsdparsaSdpMediaSection::LoadPort() {
  mPort = static_cast<uint16_t>(sdp_get_media_port(GetSection()));
  mPortCount = static_cast<uint16_t>(sdp_get_media_port_count(GetSection()));
}

void RsdparsaSdpMediaSection::LoadProtocol() {
  switch (sdp_get_media_protocol(GetSection())) {
    case RustSdpProtocolValue::RtpSavpf:
      mProtocol = kRtpSavpf;
      return;
    case RustSdpProtocolValue::UdpTlsRtpSavp:
      mProtocol = kUdpTlsRtpSavp;
      return;
    case RustSdpProtocolValue::TcpDtlsRtpSavp:
      mProtocol = kTcpDtlsRtpSavp;
      return;
    case RustSdpProtocolValue::UdpTlsRtpSavpf:
      mProtocol = kUdpTlsRtpSavpf;
      return;
    case RustSdpProtocolValue::TcpDtlsRtpSavpf:
      mProtocol = kTcpDtlsRtpSavpf;
      return;
    case RustSdpProtocolValue::DtlsSctp:
      mProtocol = kDtlsSctp;
      return;
    case RustSdpProtocolValue::UdpDtlsSctp:
      mProtocol = kUdpDtlsSctp;
      return;
    case RustSdpProtocolValue::TcpDtlsSctp:
      mProtocol = kTcpDtlsSctp;
      return;
    case RustSdpProtocolValue::RtpAvp:
      mProtocol = kRtpAvp;
      return;
    case RustSdpProtocolValue::RtpAvpf:
      mProtocol = kRtpAvpf;
      return;
    case RustSdpProtocolValue::RtpSavp:
      mProtocol = kRtpSavp;
      return;
  }
  MOZ_CRASH("invalid media protocol");
}

void RsdparsaSdpMediaSection::LoadFormats() {
  switch (sdp_get_format_type(GetSection())) {
    case RustSdpFormatType::Integers:
      for (uint32_t val :
           convertRustSpan(sdp_get_format_u32_vec(GetSection()))) {
        mFormats.push_back(std::to_string(val));
      }
      return;
    case RustSdpFormatType::Strings: {
      // This is a guess at reasonable upper bound of format strings per media
      // section. Adding more than this will result in resizing.
      constexpr size_t kInitialFormatCapacity = 8;
      AutoTArray<StringView, kInitialFormatCapacity> formats;
      sdp_get_format_string_vec(GetSection(), &formats);
      for (const auto& view : formats) {
        mFormats.emplace_back(convertStringView(view));
      }
      return;
    }
    case RustSdpFormatType::Unknown:
      // Unknown media types have unknown format list grammars.
      // We store the format list as a single string so that it can be
      // reserialized.
      return;
  }
  MOZ_CRASH("invalid format type");
}

UniquePtr<SdpConnection> convertRustConnection(const RustSdpConnection conn) {
  auto address = convertExplicitlyTypedAddress(conn.addr);
  return MakeUnique<SdpConnection>(address.first, address.second, conn.ttl,
                                   conn.amount);
}

void RsdparsaSdpMediaSection::LoadConnection() {
  RustSdpConnection conn;
  nsresult nr;
  if (sdp_media_has_connection(GetSection())) {
    nr = sdp_get_media_connection(GetSection(), &conn);
    if (NS_SUCCEEDED(nr)) {
      mConnection = convertRustConnection(conn);
    }
  } else if (sdp_session_has_connection(mSession.get())) {
    nr = sdp_get_session_connection(mSession.get(), &conn);
    if (NS_SUCCEEDED(nr)) {
      mConnection = convertRustConnection(conn);
    }
  }
}

void RsdparsaSdpMediaSection::LoadBandwidths() {
  convertBandwidths(sdp_get_media_bandwidth_vec(GetSection()), mBandwidths);
}

}  // namespace mozilla
