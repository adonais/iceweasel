/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <wrl.h>

#include "MFPMPHostWrapper.h"
#include "WMF.h"
#include "gtest/gtest.h"

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::MakeAndInitialize;
using mozilla::MFPMPHostWrapper;

namespace {

// IStream stub whose Stat() size and Read() reported byte count are
// independently caller-controlled, so tests can drive ActivateClassById with a
// range of object-stream sizes.
class MockStream : public IStream {
 public:
  MockStream(ULONGLONG aStatSize, ULONG aReadResult)
      : mStatSize(aStatSize), mReadResult(aReadResult) {}

  IFACEMETHODIMP QueryInterface(REFIID aRiid, void** aObject) override {
    if (aRiid == IID_IUnknown || aRiid == IID_ISequentialStream ||
        aRiid == IID_IStream) {
      *aObject = static_cast<IStream*>(this);
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

  IFACEMETHODIMP Read(void* aData, ULONG aCount, ULONG* aRead) override {
    if (aRead) {
      *aRead = mReadResult;
    }
    return S_OK;
  }
  IFACEMETHODIMP Write(const void*, ULONG, ULONG*) override {
    return E_NOTIMPL;
  }

  IFACEMETHODIMP Stat(STATSTG* aStat, DWORD) override {
    *aStat = {};
    aStat->cbSize.QuadPart = mStatSize;
    return S_OK;
  }
  IFACEMETHODIMP Seek(LARGE_INTEGER, DWORD, ULARGE_INTEGER*) override {
    return E_NOTIMPL;
  }
  IFACEMETHODIMP SetSize(ULARGE_INTEGER) override { return E_NOTIMPL; }
  IFACEMETHODIMP CopyTo(IStream*, ULARGE_INTEGER, ULARGE_INTEGER*,
                        ULARGE_INTEGER*) override {
    return E_NOTIMPL;
  }
  IFACEMETHODIMP Commit(DWORD) override { return E_NOTIMPL; }
  IFACEMETHODIMP Revert() override { return E_NOTIMPL; }
  IFACEMETHODIMP LockRegion(ULARGE_INTEGER, ULARGE_INTEGER, DWORD) override {
    return E_NOTIMPL;
  }
  IFACEMETHODIMP UnlockRegion(ULARGE_INTEGER, ULARGE_INTEGER, DWORD) override {
    return E_NOTIMPL;
  }
  IFACEMETHODIMP Clone(IStream**) override { return E_NOTIMPL; }

 private:
  virtual ~MockStream() = default;
  const ULONGLONG mStatSize;
  const ULONG mReadResult;
  ULONG mRefCnt = 1;
};

// IMFPMPHost stub. CreateObjectByCLSID returns a sentinel so a call that gets
// past the object-stream block resolves to a distinct HRESULT rather than
// dereferencing a real PMP host.
constexpr HRESULT kHostSentinel = E_NOTIMPL;

class MockPMPHost : public IMFPMPHost {
 public:
  IFACEMETHODIMP QueryInterface(REFIID aRiid, void** aObject) override {
    if (aRiid == IID_IUnknown || aRiid == __uuidof(IMFPMPHost)) {
      *aObject = static_cast<IMFPMPHost*>(this);
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

  IFACEMETHODIMP LockProcess() override { return S_OK; }
  IFACEMETHODIMP UnlockProcess() override { return S_OK; }
  IFACEMETHODIMP CreateObjectByCLSID(REFCLSID, IStream*, REFIID,
                                     void**) override {
    return kHostSentinel;
  }

 private:
  virtual ~MockPMPHost() = default;
  ULONG mRefCnt = 1;
};

HRESULT ActivateWithStream(ULONGLONG aStatSize, ULONG aReadResult);

}  // namespace

TEST(MFPMPHostWrapper, RejectsStreamReadExceedingBufferLength)
{
  ASSERT_TRUE(mozilla::wmf::MediaFoundationInitializer::HasInitialized());
  EXPECT_EQ(E_UNEXPECTED,
            ActivateWithStream(/* aStatSize */ 1, /* aReadResult */ 0x100))
      << "A reported read size larger than the allocated buffer must be "
         "rejected with E_UNEXPECTED rather than forwarded to SetBlob.";
}

TEST(MFPMPHostWrapper, RejectsStreamSizeExceeding32Bits)
{
  ASSERT_TRUE(mozilla::wmf::MediaFoundationInitializer::HasInitialized());
  EXPECT_EQ(E_INVALIDARG, ActivateWithStream(/* aStatSize */ 0x1'0000'0000,
                                             /* aReadResult */ 0))
      << "A stream size that does not fit in 32 bits must be rejected with "
         "E_INVALIDARG.";
}

TEST(MFPMPHostWrapper, EmptyStreamSkipsObjectStream)
{
  ASSERT_TRUE(mozilla::wmf::MediaFoundationInitializer::HasInitialized());
  EXPECT_EQ(kHostSentinel,
            ActivateWithStream(/* aStatSize */ 0, /* aReadResult */ 0))
      << "An empty stream must skip the object-stream attribute and proceed "
         "to the PMP host (mock returns kHostSentinel).";
}

TEST(MFPMPHostWrapper, ConformingStreamIsForwarded)
{
  ASSERT_TRUE(mozilla::wmf::MediaFoundationInitializer::HasInitialized());
  EXPECT_EQ(kHostSentinel,
            ActivateWithStream(/* aStatSize */ 4, /* aReadResult */ 4))
      << "A conforming stream (reported read size equals the buffer length) "
         "must be forwarded and reach the PMP host (mock returns "
         "kHostSentinel).";
}

// Following are helper functions.

namespace {

HRESULT ActivateWithStream(ULONGLONG aStatSize, ULONG aReadResult) {
  ComPtr<IMFPMPHost> host;
  host.Attach(new MockPMPHost());
  ComPtr<IStream> stream;
  stream.Attach(new MockStream(aStatSize, aReadResult));

  ComPtr<MFPMPHostWrapper> wrapper;
  HRESULT hr = MakeAndInitialize<MFPMPHostWrapper>(&wrapper, host);
  EXPECT_HRESULT_SUCCEEDED(hr);
  if (FAILED(hr)) {
    return hr;
  }

  void* activated = nullptr;
  return wrapper->ActivateClassById(L"test", stream.Get(), IID_IUnknown,
                                    &activated);
}

}  // namespace
