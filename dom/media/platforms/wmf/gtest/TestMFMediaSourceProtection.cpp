/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <mfcontentdecryptionmodule.h>
#include <mfidl.h>
#include <wrl.h>

#include "MFCDMProxy.h"
#include "MFMediaEngineStream.h"
#include "MFMediaSource.h"
#include "MediaInfo.h"
#include "WMF.h"
#include "gtest/gtest.h"
#include "mozilla/TaskQueue.h"

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::MakeAndInitialize;
using mozilla::AudioInfo;
using mozilla::MFCDMProxy;
using mozilla::MFMediaSource;
using mozilla::VideoInfo;

namespace {

// Each mock implements the one method its test drives; the rest of the
// interface exists only to satisfy the vtable.
#define MOCK_UNIMPLEMENTED(signature) \
  IFACEMETHODIMP signature override { return E_NOTIMPL; }

// IUnknown for a mock implementing exactly one interface besides IUnknown.
template <typename Interface>
class MockUnknown : public Interface {
 public:
  IFACEMETHODIMP QueryInterface(REFIID aRiid, void** aObject) override {
    if (aRiid == IID_IUnknown || aRiid == __uuidof(Interface)) {
      *aObject = static_cast<Interface*>(this);
      AddRef();
      return S_OK;
    }
    *aObject = nullptr;
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return ++mRefCnt; }
  IFACEMETHODIMP_(ULONG) Release() override {
    ULONG count = --mRefCnt;
    if (count == 0) {
      delete this;
    }
    return count;
  }

 protected:
  virtual ~MockUnknown() = default;

 private:
  ULONG mRefCnt = 0;
};

// MFCDMProxy only ever QIs the authority, so no method needs a body.
class MockInputTrustAuthority final
    : public MockUnknown<IMFInputTrustAuthority> {
 public:
  MOCK_UNIMPLEMENTED(GetDecrypter(REFIID, void**))
  MOCK_UNIMPLEMENTED(RequestAccess(MFPOLICYMANAGER_ACTION, IMFActivate**))
  MOCK_UNIMPLEMENTED(GetPolicy(MFPOLICYMANAGER_ACTION, IMFOutputPolicy**))
  MOCK_UNIMPLEMENTED(BindAccess(MFINPUTTRUSTAUTHORITY_ACCESS_PARAMS*))
  MOCK_UNIMPLEMENTED(UpdateAccess(MFINPUTTRUSTAUTHORITY_ACCESS_PARAMS*))
  MOCK_UNIMPLEMENTED(Reset())
};

// Hands out a MockInputTrustAuthority and records which stream ids were asked
// for, so a test can assert that the video branch was among them.
class MockTrustedInput final : public MockUnknown<IMFTrustedInput> {
 public:
  IFACEMETHODIMP GetInputTrustAuthority(DWORD aStreamId, REFIID aRiid,
                                        IUnknown** aObject) override {
    mRequestedStreamIds.AppendElement(aStreamId);
    ComPtr<IMFInputTrustAuthority> ita = new MockInputTrustAuthority();
    return ita.CopyTo(aRiid, reinterpret_cast<void**>(aObject));
  }

  nsTArray<DWORD> mRequestedStreamIds;
};

class MockContentDecryptionModule final
    : public MockUnknown<IMFContentDecryptionModule> {
 public:
  IFACEMETHODIMP CreateTrustedInput(const BYTE*, DWORD,
                                    IMFTrustedInput** aTrustedInput) override {
    mTrustedInput = new MockTrustedInput();
    return mTrustedInput.CopyTo(aTrustedInput);
  }

  MOCK_UNIMPLEMENTED(SetContentEnabler(IMFContentEnabler*, IMFAsyncResult*))
  MOCK_UNIMPLEMENTED(GetSuspendNotify(IMFCdmSuspendNotify**))
  MOCK_UNIMPLEMENTED(SetPMPHostApp(IMFPMPHostApp*))
  MOCK_UNIMPLEMENTED(CreateSession(MF_MEDIAKEYSESSION_TYPE,
                                   IMFContentDecryptionModuleSessionCallbacks*,
                                   IMFContentDecryptionModuleSession**))
  MOCK_UNIMPLEMENTED(SetServerCertificate(const BYTE*, DWORD))
  MOCK_UNIMPLEMENTED(GetProtectionSystemIds(GUID**, DWORD*))

  ComPtr<MockTrustedInput> mTrustedInput;
};

// Whether the first video config declares its samples encrypted.
enum class VideoCrypto { Clear, Encrypted };
// Whether the page attached a CDM before any data arrived, i.e. called
// setMediaKeys() up front. This is what mIsEncryptedCustomInit records.
enum class CdmAttachedBeforeData { No, Yes };

class MFMediaSourceProtectionTest : public testing::Test {
 protected:
  void SetUp() override {
    ASSERT_TRUE(mozilla::wmf::MediaFoundationInitializer::HasInitialized());
  }

  void TearDown() override {
    if (!mSource) {
      return;
    }
    RefPtr<mozilla::TaskQueue> queue = mSource->GetTaskQueue();
    mSource->Shutdown();
    mSource->ShutdownTaskQueue();
    mSource = nullptr;
    if (queue) {
      queue->AwaitShutdownAndIdle();
    }
  }

  // Builds a source the way MFMediaEngineParent does. Wrap calls in
  // ASSERT_NO_FATAL_FAILURE, because a failed assertion here only returns from
  // this helper.
  void CreateSource(VideoCrypto aVideoCrypto,
                    CdmAttachedBeforeData aCdmAttached) {
    auto audioInfo = [] {
      AudioInfo info;
      info.mMimeType = "audio/mp4a-latm"_ns;
      info.mRate = 44100;
      info.mChannels = 2;
      // AAC LC, 44.1kHz, stereo. MFMediaEngineAudioStream needs a decoder
      // config to build its media type.
      mozilla::AacCodecSpecificData aac;
      const uint8_t asc[] = {0x12, 0x10};
      aac.mDecoderConfigDescriptorBinaryBlob->AppendElements(asc, sizeof(asc));
      info.mCodecSpecificConfig =
          mozilla::AudioCodecSpecificVariant{std::move(aac)};
      return info;
    }();

    auto videoInfo = [aVideoCrypto] {
      VideoInfo info;
      info.mMimeType = "video/avc"_ns;
      info.mImage = info.mDisplay = mozilla::gfx::IntSize{1280, 720};
      if (aVideoCrypto == VideoCrypto::Encrypted) {
        info.mCrypto.mCryptoScheme = mozilla::CryptoScheme::Cenc;
      }
      return info;
    }();

    ComPtr<MFMediaSource> source;
    ASSERT_HRESULT_SUCCEEDED(MakeAndInitialize<MFMediaSource>(
        &source, mozilla::Some(audioInfo), mozilla::Some(videoInfo),
        mozilla::GetCurrentSerialEventTarget(),
        aCdmAttached == CdmAttachedBeforeData::Yes));
    ASSERT_NE(source.Get(), nullptr);
    mSource = source;
  }

  void AttachMockCdm() {
    mCdm = new MockContentDecryptionModule();
    mProxy = new MFCDMProxy(mCdm.Get(), 0 /* aCDMParentId */);
    mSource->SetCDMProxy(mProxy);
  }

  static bool IsDescriptorProtected(mozilla::MFMediaEngineStream* aStream) {
    ComPtr<IMFStreamDescriptor> descriptor;
    EXPECT_HRESULT_SUCCEEDED(aStream->GetStreamDescriptor(&descriptor));
    UINT32 protectedFlag = 0;
    // The attribute is absent rather than zero when the stream is not
    // protected, so a failed read means "not protected".
    if (FAILED(descriptor->GetUINT32(MF_SD_PROTECTED, &protectedFlag))) {
      return false;
    }
    return protectedFlag != 0;
  }

  ComPtr<MFMediaSource> mSource;
  ComPtr<MockContentDecryptionModule> mCdm;
  RefPtr<MFCDMProxy> mProxy;
};

}  // namespace

// A clear lead carries no encrypted samples yet, but the pipeline is already
// protected because a CDM is attached, and that is what both streams report to
// Media Foundation.
TEST_F(MFMediaSourceProtectionTest, ClearLeadStreamsAreProtected) {
  ASSERT_NO_FATAL_FAILURE(
      CreateSource(VideoCrypto::Clear, CdmAttachedBeforeData::Yes));
  EXPECT_TRUE(mSource->GetVideoStream()->IsEncrypted());
  EXPECT_TRUE(mSource->GetAudioStream()->IsEncrypted());
  EXPECT_TRUE(mSource->IsEncrypted());
  EXPECT_TRUE(IsDescriptorProtected(mSource->GetVideoStream()));
  EXPECT_TRUE(IsDescriptorProtected(mSource->GetAudioStream()));
}

// The regression test for the MF_E_TOPO_UNSUPPORTED failure. Media Foundation
// asks for an input trust authority for every branch it was told is protected,
// and cannot resolve the topology if we refuse one.
TEST_F(MFMediaSourceProtectionTest, ClearLeadVideoStreamGetsATrustAuthority) {
  ASSERT_NO_FATAL_FAILURE(
      CreateSource(VideoCrypto::Clear, CdmAttachedBeforeData::Yes));
  AttachMockCdm();

  ComPtr<IUnknown> ita;
  EXPECT_HRESULT_SUCCEEDED(mSource->GetInputTrustAuthority(
      mSource->GetVideoStream()->DescriptorId(), IID_IUnknown, &ita));
  EXPECT_NE(ita.Get(), nullptr);
  EXPECT_TRUE(mCdm->mTrustedInput->mRequestedStreamIds.Contains(
      mSource->GetVideoStream()->DescriptorId()));
}

// The ordinary fully encrypted path must keep working.
TEST_F(MFMediaSourceProtectionTest, EncryptedVideoStreamGetsATrustAuthority) {
  ASSERT_NO_FATAL_FAILURE(
      CreateSource(VideoCrypto::Encrypted, CdmAttachedBeforeData::No));
  AttachMockCdm();

  ComPtr<IUnknown> ita;
  EXPECT_HRESULT_SUCCEEDED(mSource->GetInputTrustAuthority(
      mSource->GetVideoStream()->DescriptorId(), IID_IUnknown, &ita));
  EXPECT_NE(ita.Get(), nullptr);
}

// Clear content with a CDM attached but no encryption expected must still be
// refused, so the fix did not simply make everything protected. This reaches
// the IsEncrypted() gate rather than the earlier missing-proxy one.
TEST_F(MFMediaSourceProtectionTest, ClearVideoStreamWithCdmIsRefused) {
  ASSERT_NO_FATAL_FAILURE(
      CreateSource(VideoCrypto::Clear, CdmAttachedBeforeData::No));
  AttachMockCdm();

  EXPECT_FALSE(mSource->GetVideoStream()->IsEncrypted());
  EXPECT_FALSE(IsDescriptorProtected(mSource->GetVideoStream()));

  ComPtr<IUnknown> ita;
  EXPECT_EQ(mSource->GetInputTrustAuthority(
                mSource->GetVideoStream()->DescriptorId(), IID_IUnknown, &ita),
            MF_E_NOT_PROTECTED);
}
