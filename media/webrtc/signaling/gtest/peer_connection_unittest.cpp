/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MockJsepCodecPreferences.h"
#include "PeerConnectionImpl.h"
#include "api/rtp_parameters.h"
#include "gtest/gtest.h"

namespace mozilla {

static int RtpExtensionHeaderUriComparator(
    const PeerConnectionImpl::RtpExtensionHeader& aHeader, const char* aUri) {
  // TODO bug 2051688, bug 2051711: use operator<=>.
  std::strong_ordering ord =
      std::string_view(aHeader.extensionname.get()) <=> std::string_view(aUri);
  return ord == 0 ? 0 : ord < 0 ? -1 : 1;
}

static const PeerConnectionImpl::RtpExtensionHeader* FindExtension(
    const nsTArray<PeerConnectionImpl::RtpExtensionHeader>& aHeaders,
    const char* aUri) {
  auto idx = aHeaders.IndexOf(aUri, 0, &RtpExtensionHeaderUriComparator);
  if (idx == aHeaders.NoIndex) {
    return nullptr;
  }

  return &aHeaders[idx];
}

TEST(PeerConnectionImplTest, GetDefaultRtpExtensionsTransportCCBoth)
{
  MockJsepCodecPreferences prefs;
  prefs.mUseTransportCC = true;
  prefs.mUseAudioTransportCC = true;
  AutoTArray<PeerConnectionImpl::RtpExtensionHeader, 16> headers;
  PeerConnectionImpl::GetDefaultRtpExtensions(prefs, &headers);
  const auto* ext =
      FindExtension(headers, webrtc::RtpExtension::kTransportSequenceNumberUri);
  ASSERT_NE(nullptr, ext);
  EXPECT_EQ(JsepMediaType::kAudioVideo, ext->mMediaType);
}

TEST(PeerConnectionImplTest, GetDefaultRtpExtensionsTransportCCVideoOnly)
{
  MockJsepCodecPreferences prefs;
  prefs.mUseTransportCC = true;
  prefs.mUseAudioTransportCC = false;
  AutoTArray<PeerConnectionImpl::RtpExtensionHeader, 16> headers;
  PeerConnectionImpl::GetDefaultRtpExtensions(prefs, &headers);
  const auto* ext =
      FindExtension(headers, webrtc::RtpExtension::kTransportSequenceNumberUri);
  ASSERT_NE(nullptr, ext);
  EXPECT_EQ(JsepMediaType::kVideo, ext->mMediaType);
}

TEST(PeerConnectionImplTest, GetDefaultRtpExtensionsTransportCCAudioOnly)
{
  MockJsepCodecPreferences prefs;
  prefs.mUseTransportCC = false;
  prefs.mUseAudioTransportCC = true;
  AutoTArray<PeerConnectionImpl::RtpExtensionHeader, 16> headers;
  PeerConnectionImpl::GetDefaultRtpExtensions(prefs, &headers);
  const auto* ext =
      FindExtension(headers, webrtc::RtpExtension::kTransportSequenceNumberUri);
  ASSERT_NE(nullptr, ext);
  EXPECT_EQ(JsepMediaType::kAudio, ext->mMediaType);
}

TEST(PeerConnectionImplTest, GetDefaultRtpExtensionsTransportCCNeither)
{
  MockJsepCodecPreferences prefs;
  prefs.mUseTransportCC = false;
  prefs.mUseAudioTransportCC = false;
  AutoTArray<PeerConnectionImpl::RtpExtensionHeader, 16> headers;
  PeerConnectionImpl::GetDefaultRtpExtensions(prefs, &headers);
  EXPECT_EQ(nullptr,
            FindExtension(headers,
                          webrtc::RtpExtension::kTransportSequenceNumberUri));
}

}  // namespace mozilla
