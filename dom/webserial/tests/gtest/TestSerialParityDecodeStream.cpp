/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>
#include <cstring>

#include "PosixSerialParityDecodeStream.h"
#include "gtest/gtest.h"
#include "mozilla/RefPtr.h"
#include "nsError.h"
#include "nsTArray.h"

using namespace mozilla;
using namespace mozilla::dom;

namespace {

// A minimal nsIAsyncInputStream that serves a fixed byte sequence, at most
// aMaxPerRead bytes per Read() call so that tests can exercise marker/escape
// sequences split across read boundaries. Returns NS_OK with 0 bytes at EOF.
class FakeSerialInputStream final : public nsIAsyncInputStream {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIINPUTSTREAM
  NS_DECL_NSIASYNCINPUTSTREAM

  FakeSerialInputStream(nsTArray<uint8_t>&& aData, uint32_t aMaxPerRead)
      : mData(std::move(aData)), mMaxPerRead(aMaxPerRead) {}

  // Test hook: invoke the most recently registered AsyncWait callback, passing
  // this inner stream as the ready stream (as a real async stream would).
  void FireWaitCallback() {
    nsCOMPtr<nsIInputStreamCallback> cb = mWaitCallback.forget();
    if (cb) {
      cb->OnInputStreamReady(this);
    }
  }

 private:
  ~FakeSerialInputStream() = default;

  nsTArray<uint8_t> mData;
  uint32_t mPos = 0;
  const uint32_t mMaxPerRead;
  nsCOMPtr<nsIInputStreamCallback> mWaitCallback;
};

NS_IMPL_ISUPPORTS(FakeSerialInputStream, nsIInputStream, nsIAsyncInputStream)

NS_IMETHODIMP FakeSerialInputStream::Read(char* aBuf, uint32_t aCount,
                                          uint32_t* aResult) {
  uint32_t remaining = mData.Length() - mPos;
  uint32_t n = std::min({aCount, remaining, mMaxPerRead});
  if (n) {
    memcpy(aBuf, mData.Elements() + mPos, n);
    mPos += n;
  }
  *aResult = n;
  return NS_OK;
}

NS_IMETHODIMP FakeSerialInputStream::ReadSegments(nsWriteSegmentFun, void*,
                                                  uint32_t, uint32_t*) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP FakeSerialInputStream::Available(uint64_t* aResult) {
  *aResult = mData.Length() - mPos;
  return NS_OK;
}

NS_IMETHODIMP FakeSerialInputStream::StreamStatus() {
  return mPos < mData.Length() ? NS_OK : NS_BASE_STREAM_CLOSED;
}

NS_IMETHODIMP FakeSerialInputStream::Close() {
  mPos = mData.Length();
  return NS_OK;
}

NS_IMETHODIMP FakeSerialInputStream::IsNonBlocking(bool* aResult) {
  *aResult = true;
  return NS_OK;
}

NS_IMETHODIMP FakeSerialInputStream::CloseWithStatus(nsresult) {
  mPos = mData.Length();
  return NS_OK;
}

NS_IMETHODIMP FakeSerialInputStream::AsyncWait(
    nsIInputStreamCallback* aCallback, uint32_t, uint32_t, nsIEventTarget*) {
  mWaitCallback = aCallback;
  return NS_OK;
}

// Records the stream it is handed by OnInputStreamReady.
class RecordingCallback final : public nsIInputStreamCallback {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIINPUTSTREAMCALLBACK

  bool mCalled = false;
  nsCOMPtr<nsIAsyncInputStream> mReadyStream;

 private:
  ~RecordingCallback() = default;
};

NS_IMPL_ISUPPORTS(RecordingCallback, nsIInputStreamCallback)

NS_IMETHODIMP RecordingCallback::OnInputStreamReady(
    nsIAsyncInputStream* aStream) {
  mCalled = true;
  mReadyStream = aStream;
  return NS_OK;
}

// Feeds aInput through PosixSerialParityDecodeStream (reading at most
// aMaxPerRead raw bytes per inner read), collecting decoded output into aOut.
// Returns the terminating status: NS_OK on clean EOF, or the latched error.
nsresult RunDecoder(const nsTArray<uint8_t>& aInput, uint32_t aMaxPerRead,
                    nsTArray<uint8_t>& aOut) {
  aOut.Clear();
  auto inner = MakeRefPtr<FakeSerialInputStream>(aInput.Clone(), aMaxPerRead);
  auto decoder = MakeRefPtr<PosixSerialParityDecodeStream>(inner);

  // Bound iterations to guard against an unexpected infinite WOULD_BLOCK loop.
  for (uint32_t i = 0; i < 100000; ++i) {
    char buf[64];
    uint32_t got = 0;
    nsresult rv = decoder->Read(buf, sizeof(buf), &got);
    if (rv == NS_BASE_STREAM_WOULD_BLOCK) {
      continue;
    }
    if (NS_FAILED(rv)) {
      return rv;
    }
    if (got == 0) {
      return NS_OK;
    }
    aOut.AppendElements(reinterpret_cast<uint8_t*>(buf), got);
  }
  ADD_FAILURE() << "RunDecoder did not terminate";
  return NS_ERROR_FAILURE;
}

void ExpectBytes(const nsTArray<uint8_t>& aActual,
                 const nsTArray<uint8_t>& aExpected) {
  ASSERT_EQ(aActual.Length(), aExpected.Length());
  for (size_t i = 0; i < aExpected.Length(); ++i) {
    EXPECT_EQ(aActual[i], aExpected[i]) << "at index " << i;
  }
}

}  // namespace

TEST(WebSerialParityDecode, PlainBytesPassThrough)
{
  nsTArray<uint8_t> input{1, 2, 3, 4, 5};
  nsTArray<uint8_t> expected{1, 2, 3, 4, 5};
  for (uint32_t chunk : {1u, 2u, 3u, 64u}) {
    nsTArray<uint8_t> out;
    EXPECT_EQ(RunDecoder(input, chunk, out), NS_OK);
    ExpectBytes(out, expected);
  }
}

TEST(WebSerialParityDecode, EscapedFF)
{
  // 0xff 0xff is a single legitimate 0xff byte.
  nsTArray<uint8_t> input{0x01, 0xff, 0xff, 0x02};
  nsTArray<uint8_t> expected{0x01, 0xff, 0x02};
  for (uint32_t chunk : {1u, 2u, 3u, 64u}) {
    nsTArray<uint8_t> out;
    EXPECT_EQ(RunDecoder(input, chunk, out), NS_OK);
    ExpectBytes(out, expected);
  }
}

TEST(WebSerialParityDecode, ConsecutiveEscapedFF)
{
  nsTArray<uint8_t> input{0xff, 0xff, 0xff, 0xff};
  nsTArray<uint8_t> expected{0xff, 0xff};
  for (uint32_t chunk : {1u, 2u, 3u, 64u}) {
    nsTArray<uint8_t> out;
    EXPECT_EQ(RunDecoder(input, chunk, out), NS_OK);
    ExpectBytes(out, expected);
  }
}

TEST(WebSerialParityDecode, ParityErrorAfterValidBytes)
{
  // 0xff 0x00 <byte> marks a parity error. Valid bytes before it are delivered,
  // then the stream fails.
  nsTArray<uint8_t> input{0x01, 0x02, 0xff, 0x00, 0x41, 0x03};
  nsTArray<uint8_t> expected{0x01, 0x02};
  for (uint32_t chunk : {1u, 2u, 3u, 4u, 64u}) {
    nsTArray<uint8_t> out;
    EXPECT_EQ(RunDecoder(input, chunk, out), NS_ERROR_DOM_SERIAL_PARITY_ERROR);
    ExpectBytes(out, expected);
  }
}

TEST(WebSerialParityDecode, ParityErrorAtStart)
{
  nsTArray<uint8_t> input{0xff, 0x00, 0x00};
  nsTArray<uint8_t> expected{};
  for (uint32_t chunk : {1u, 2u, 3u, 64u}) {
    nsTArray<uint8_t> out;
    EXPECT_EQ(RunDecoder(input, chunk, out), NS_ERROR_DOM_SERIAL_PARITY_ERROR);
    ExpectBytes(out, expected);
  }
}

TEST(WebSerialParityDecode, EscapeThenParityError)
{
  // A real 0xff byte followed by a parity error marker.
  nsTArray<uint8_t> input{0xff, 0xff, 0x05, 0xff, 0x00, 0x42};
  nsTArray<uint8_t> expected{0xff, 0x05};
  for (uint32_t chunk : {1u, 2u, 3u, 64u}) {
    nsTArray<uint8_t> out;
    EXPECT_EQ(RunDecoder(input, chunk, out), NS_ERROR_DOM_SERIAL_PARITY_ERROR);
    ExpectBytes(out, expected);
  }
}

TEST(WebSerialParityDecode, EmptyInput)
{
  nsTArray<uint8_t> input{};
  nsTArray<uint8_t> out;
  EXPECT_EQ(RunDecoder(input, 64u, out), NS_OK);
  EXPECT_EQ(out.Length(), 0u);
}

TEST(WebSerialParityDecode, AvailableReportsDecodedCount)
{
  // 4 raw bytes (0x01, 0xff 0xff -> 0xff, 0x02) decode to 3 deliverable bytes.
  // Available() must report 3, not the inner stream's raw count of 4.
  nsTArray<uint8_t> input{0x01, 0xff, 0xff, 0x02};
  for (uint32_t chunk : {1u, 2u, 3u, 64u}) {
    auto inner = MakeRefPtr<FakeSerialInputStream>(input.Clone(), chunk);
    auto decoder = MakeRefPtr<PosixSerialParityDecodeStream>(inner);
    uint64_t avail = 0;
    EXPECT_EQ(decoder->Available(&avail), NS_OK);
    EXPECT_LE(avail, 3u);
    EXPECT_GT(avail, 0u);
  }
}

TEST(WebSerialParityDecode, AvailableSurfacesParityErrorAtStart)
{
  // With no deliverable bytes ahead of the marker, Available() surfaces the
  // parity error directly rather than reporting phantom available bytes.
  nsTArray<uint8_t> input{0xff, 0x00, 0x41};
  auto inner = MakeRefPtr<FakeSerialInputStream>(input.Clone(), 64u);
  auto decoder = MakeRefPtr<PosixSerialParityDecodeStream>(inner);
  uint64_t avail = 0;
  EXPECT_EQ(decoder->Available(&avail), NS_ERROR_DOM_SERIAL_PARITY_ERROR);
}

TEST(WebSerialParityDecode, AvailableReportsBytesBeforeError)
{
  // Valid bytes precede the error marker: Available() reports those bytes and
  // defers the error until they have been consumed.
  nsTArray<uint8_t> input{0x01, 0x02, 0xff, 0x00, 0x41};
  auto inner = MakeRefPtr<FakeSerialInputStream>(input.Clone(), 64u);
  auto decoder = MakeRefPtr<PosixSerialParityDecodeStream>(inner);
  uint64_t avail = 0;
  EXPECT_EQ(decoder->Available(&avail), NS_OK);
  EXPECT_EQ(avail, 2u);
}

TEST(WebSerialParityDecode, AvailableWithIncompleteEscape)
{
  // A lone trailing 0xff is an incomplete escape: nothing is deliverable yet,
  // so Available() reports 0 without failing.
  nsTArray<uint8_t> input{0xff};
  auto inner = MakeRefPtr<FakeSerialInputStream>(input.Clone(), 64u);
  auto decoder = MakeRefPtr<PosixSerialParityDecodeStream>(inner);
  uint64_t avail = 0;
  EXPECT_EQ(decoder->Available(&avail), NS_OK);
  EXPECT_EQ(avail, 0u);
}

TEST(WebSerialParityDecode, AsyncWaitForwardsDecoderAsReadyStream)
{
  // When the inner stream signals readiness, the consumer's callback must be
  // handed the decoder (so reads go through decoding), not the raw inner
  // stream.
  nsTArray<uint8_t> input{0x01, 0x02};
  auto inner = MakeRefPtr<FakeSerialInputStream>(input.Clone(), 64u);
  auto decoder = MakeRefPtr<PosixSerialParityDecodeStream>(inner);
  auto callback = MakeRefPtr<RecordingCallback>();

  EXPECT_EQ(decoder->AsyncWait(callback, 0, 0, nullptr), NS_OK);
  inner->FireWaitCallback();

  EXPECT_TRUE(callback->mCalled);
  EXPECT_EQ(callback->mReadyStream.get(),
            static_cast<nsIAsyncInputStream*>(decoder.get()));
}

TEST(WebSerialParityDecode, AsyncWaitClearedCallbackIsNotForwarded)
{
  // Clearing the wait (null callback) must prevent a later inner notification
  // from reaching the original consumer.
  nsTArray<uint8_t> input{0x01};
  auto inner = MakeRefPtr<FakeSerialInputStream>(input.Clone(), 64u);
  auto decoder = MakeRefPtr<PosixSerialParityDecodeStream>(inner);
  auto callback = MakeRefPtr<RecordingCallback>();

  EXPECT_EQ(decoder->AsyncWait(callback, 0, 0, nullptr), NS_OK);
  EXPECT_EQ(decoder->AsyncWait(nullptr, 0, 0, nullptr), NS_OK);
  inner->FireWaitCallback();

  EXPECT_FALSE(callback->mCalled);
}
