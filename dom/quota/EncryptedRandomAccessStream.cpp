/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EncryptedRandomAccessStream.h"

#include <algorithm>

#include "ErrorList.h"
#include "mozilla/Assertions.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/EndianUtils.h"
#include "mozilla/Span.h"
#include "mozilla/ipc/RandomAccessStreamParams.h"
#include "nsCOMPtr.h"
#include "nsError.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsIRandomAccessStream.h"
#include "nsISeekableStream.h"
#include "nsISupports.h"
#include "nsServiceManagerUtils.h"
#include "nsStreamUtils.h"
#include "nscore.h"

namespace mozilla::dom::quota {

NS_IMPL_QUERY_INTERFACE(EncryptedRandomAccessStreamBase, nsIRandomAccessStream,
                        nsIInputStream, nsIOutputStream, nsISeekableStream,
                        nsITellableStream)

NS_IMPL_ADDREF(EncryptedRandomAccessStreamBase)

NS_IMPL_RELEASE(EncryptedRandomAccessStreamBase)

NS_IMETHODIMP EncryptedRandomAccessStreamBase::Seek(int32_t aWhence,
                                                    int64_t aOffset) {
  if (mClosed) {
    return NS_BASE_STREAM_CLOSED;
  }

  auto offset = [&]() -> Maybe<CheckedInt64> {
    switch (aWhence) {
      case NS_SEEK_SET:
        return Some(CheckedInt64(aOffset));
      case NS_SEEK_CUR:
        return Some(CheckedInt64(aOffset) + mLogicalPosition);
      case NS_SEEK_END:
        return Some(CheckedInt64(aOffset) + mLogicalSize);
      default:
        return Nothing();
    }
  }();

  // Seek past end is acceptable.
  if (!offset || !offset->isValid() || offset->value() < 0) {
    return NS_ERROR_INVALID_ARG;
  }

  mLogicalPosition = offset->value();
  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::Tell(int64_t* aResult) {
  if (mClosed) {
    return NS_BASE_STREAM_CLOSED;
  }
  *aResult = static_cast<int64_t>(mLogicalPosition);
  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::Read(char* aBuf, uint32_t aCount,
                                                    uint32_t* aReadBytes) {
  return ReadSegments(NS_CopySegmentToBuffer, aBuf, aCount, aReadBytes);
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::ReadSegments(
    nsWriteSegmentFun aWriter, void* aClosure, uint32_t aCount,
    uint32_t* aReadBytes) {
  *aReadBytes = 0;

  // NOTE: Unlike |Available()|, |Tell()| and |Seek()|, which return
  // NS_BASE_STREAM_CLOSED on a closed stream, |Read()| and |ReadSegments()|
  // does not. This is because nsIInputStream documents that reading a closed
  // stream shall not raise the error. So, this mirrors
  // nsFileRandomAccessStream, which catches NS_BASE_STREAM_CLOSED and converts
  // it to NS_OK with zero bytes read.
  if (mClosed) {
    return NS_OK;
  }

  // The |mLogicalPosition < mLogicalSize| guard is required for the case where
  // a prior |Seek()| moved the position to or past the end: seeking past the
  // end is allowed, so reading from there must report EOF (zero bytes) rather
  // than loading a block that does not exist.
  while (aCount > 0 && mLogicalPosition < mLogicalSize) {
    BlockIndexType blockIndex = mLogicalPosition / sMaxTextLength;
    const auto offsetInBlock =
        static_cast<uint32_t>(mLogicalPosition % sMaxTextLength);

    if (blockIndex != mCurrentBlockIndex || !mBlockLoaded) {
      if (mBlockDirty) {
        const auto rv = SaveCurrentBlock();
        if (NS_FAILED(rv)) {
          return rv;
        }
      }
      const auto rv = LoadBlock(blockIndex);
      if (NS_FAILED(rv)) {
        return rv;
      }
    }

    if (offsetInBlock > mCurrentBlockTextLength) {
      return NS_ERROR_CORRUPTED_CONTENT;
    }

    uint32_t bytesToWrite =
        std::min(aCount, mCurrentBlockTextLength - offsetInBlock);
    // A zero-length segment here would mean that the logical size and the
    // decoded block length disagree somehow. Never call a writer with an empty
    // segment.
    if (bytesToWrite == 0) {
      return NS_ERROR_CORRUPTED_CONTENT;
    }
    uint32_t bytesWritten = 0;
    auto rv =
        aWriter(this, aClosure,
                AsChars(Span(mPlainBuffer)).From(offsetInBlock).Elements(),
                *aReadBytes, bytesToWrite, &bytesWritten);
    // As defined in nsIInputStream.idl, do not pass writer func errors.
    if (NS_FAILED(rv)) {
      return NS_OK;
    }
    // A writer that consumes zero bytes without failing is signaling that it
    // refuses to consume more data. As nsIInputStream.idl documents for
    // readSegments ("0 if reached end-of-file (or if aWriter refused to consume
    // data)"), stop here and report the bytes already read.
    if (bytesWritten == 0) {
      break;
    }

    mLogicalPosition += bytesWritten;
    MOZ_ASSERT(mLogicalPosition <= mLogicalSize);
    aCount -= bytesWritten;
    *aReadBytes += bytesWritten;
  }

  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::Available(uint64_t* aResult) {
  if (mClosed) {
    return NS_BASE_STREAM_CLOSED;
  }
  *aResult =
      mLogicalSize > mLogicalPosition ? mLogicalSize - mLogicalPosition : 0;
  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::Close() {
  if (mClosed) {
    return NS_OK;
  }

  if (mBlockDirty) {
    const auto rv = SaveCurrentBlock();
    if (NS_FAILED(rv)) {
      return rv;
    }
  }

  auto rv = mBaseStream->OutputStream()->Flush();
  if (NS_FAILED(rv)) {
    return rv;
  }

  rv = mBaseStream->InputStream()->Close();
  if (NS_FAILED(rv)) {
    return rv;
  }

  mClosed = true;
  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::IsNonBlocking(bool* aResult) {
  // EncryptedRandomAccessStream basically has a file as the backing store,
  // and so it requires I/O. Note that this is the same as
  // |nsFileRandomAccessStream|'s implementation.
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::StreamStatus() {
  return mClosed ? NS_BASE_STREAM_CLOSED : NS_OK;
}

nsIInputStream* EncryptedRandomAccessStreamBase::InputStream() { return this; }

nsIOutputStream* EncryptedRandomAccessStreamBase::OutputStream() {
  return this;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::GetInputStream(
    nsIInputStream** aResult) {
  nsCOMPtr<nsIInputStream> inputStream(this);
  inputStream.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::GetOutputStream(
    nsIOutputStream** aResult) {
  nsCOMPtr<nsIOutputStream> outputStream(this);
  outputStream.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::Write(const char* aBuf,
                                                     uint32_t aCount,
                                                     uint32_t* aResultOut) {
  return WriteSegments(NS_CopyBufferToSegment, const_cast<char*>(aBuf), aCount,
                       aResultOut);
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::WriteSegments(
    nsReadSegmentFun aReader, void* aClosure, uint32_t aCount,
    uint32_t* aWrittenBytes) {
  *aWrittenBytes = 0;

  if (mClosed) {
    return NS_BASE_STREAM_CLOSED;
  }

  if (aCount == 0) {
    return NS_OK;
  }

  // Fill any gap left by a seek past the end once, before the write loop, so
  // the loop below only ever loads/switches blocks and never deals with gaps.
  if (mLogicalPosition > mLogicalSize) {
    if (mBlockDirty) {
      const auto rv = SaveCurrentBlock();
      if (NS_FAILED(rv)) {
        return rv;
      }
    }
    const auto rv = ZeroExtendTo(mLogicalPosition);
    if (NS_FAILED(rv)) {
      return rv;
    }
  }

  while (aCount > 0) {
    BlockIndexType blockIndex = mLogicalPosition / sMaxTextLength;
    const auto offsetInBlock =
        static_cast<uint32_t>(mLogicalPosition % sMaxTextLength);

    if (blockIndex != mCurrentBlockIndex || !mBlockLoaded) {
      if (mBlockDirty) {
        const auto rv = SaveCurrentBlock();
        if (NS_FAILED(rv)) {
          return rv;
        }
      }
      MOZ_ASSERT(blockIndex <= mTotalBlockCount);
      const auto rv = blockIndex < mTotalBlockCount ? LoadBlock(blockIndex)
                                                    : LoadNewBlockAtEnd();
      if (NS_FAILED(rv)) {
        return rv;
      }
    }

    uint32_t bytesToWrite = std::min(aCount, sMaxTextLength - offsetInBlock);
    uint32_t bytesWritten = 0;
    auto rv = aReader(this, aClosure,
                      reinterpret_cast<char*>(&mPlainBuffer[offsetInBlock]),
                      *aWrittenBytes, bytesToWrite, &bytesWritten);
    // As defined in nsIOutputStream.idl, do not pass reader func errors.
    if (NS_FAILED(rv)) {
      return NS_OK;
    }
    // NOTE: nsIOutputStream.idl only lists "nothing left to write" and "reader
    // returns an error" as stop conditions, but the current other
    // implementations (e.g. |nsPipeOutputStream::WriteSegments|,
    // |EncryptingOutputStream::WriteSegments|) treats a reader that produces
    // zero bytes the same as an error: it stops, swallows the result, and keeps
    // the progress already made.
    if (bytesWritten == 0) {
      break;
    }

    mCurrentBlockTextLength =
        std::max(static_cast<TextLengthType>(offsetInBlock + bytesWritten),
                 mCurrentBlockTextLength);
    mLogicalPosition += bytesWritten;
    mLogicalSize = std::max(mLogicalSize, mLogicalPosition);

    aCount -= bytesWritten;
    *aWrittenBytes += bytesWritten;

    mBlockDirty = true;
  }

  return NS_OK;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::WriteFrom(nsIInputStream*,
                                                         uint32_t, uint32_t*) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EncryptedRandomAccessStreamBase::Flush() {
  if (mClosed) {
    return NS_BASE_STREAM_CLOSED;
  }

  // No need to flush other blocks, because the only current block can be dirty.
  const auto rv = SaveCurrentBlock();
  if (NS_FAILED(rv)) {
    return rv;
  }

  return mBaseStream->OutputStream()->Flush();
}

nsresult EncryptedRandomAccessStreamBase::ReadEncryptedBlockFromBaseStream(
    BlockIndexType aBlockIndex, EncryptedRandomAccessBlock& aEncryptedBlock) {
  const auto blockOffset = CheckedInt64(aBlockIndex) * sBlockSize;
  if (!blockOffset.isValid()) {
    return NS_ERROR_FILE_TOO_BIG;
  }
  auto rv = mBaseStream->Seek(NS_SEEK_SET, blockOffset.value());
  if (NS_FAILED(rv)) {
    return rv;
  }

  uint32_t readBytes = 0;
  rv = mBaseStream->InputStream()->Read(
      AsWritableChars(aEncryptedBlock.MutableWholeBlock()).Elements(),
      sBlockSize, &readBytes);
  if (NS_FAILED(rv)) {
    return rv;
  }
  // The base random access stream should return a complete block because it
  // receives |sBlockSize| as a |aCount|. So, a short read is treated as a
  // failure here.
  if (readBytes != sBlockSize) {
    return NS_ERROR_CORRUPTED_CONTENT;
  }

  return NS_OK;
}

nsresult EncryptedRandomAccessStreamBase::WriteEncryptedBlockToBaseStream(
    BlockIndexType aBlockIndex,
    const EncryptedRandomAccessBlock& aEncryptedBlock) {
  const auto blockOffset = CheckedInt64(aBlockIndex) * sBlockSize;
  if (!blockOffset.isValid()) {
    return NS_ERROR_FILE_TOO_BIG;
  }
  auto rv = mBaseStream->Seek(NS_SEEK_SET, blockOffset.value());
  if (NS_FAILED(rv)) {
    return rv;
  }

  uint32_t writtenBytes = 0;
  rv = mBaseStream->OutputStream()->Write(
      reinterpret_cast<const char*>(aEncryptedBlock.WholeBlock().data()),
      sBlockSize, &writtenBytes);
  if (NS_FAILED(rv)) {
    return rv;
  }
  if (writtenBytes != sBlockSize) {
    return NS_ERROR_CORRUPTED_CONTENT;
  }

  return NS_OK;
}

EncryptedRandomAccessStreamBase::AadType
EncryptedRandomAccessStreamBase::BuildAad(
    const EncryptedRandomAccessBlock& aEncryptedBlock,
    BlockIndexType aBlockIndex) {
  AadType aad{};
  auto header = aEncryptedBlock.Header();

  static_assert(aad.size() == header.size() + sizeof(aBlockIndex));

  memcpy(aad.data(), header.data(), header.size());
  mozilla::LittleEndian::writeUint64(aad.data() + header.size(), aBlockIndex);

  return aad;
}

/**
 * Note the followings:
 * - Loads the last block at the end.
 * - Doesn't change |mLogicalPosition|, but changes |mLogicalSize|.
 */
nsresult EncryptedRandomAccessStreamBase::ZeroExtendTo(
    uint64_t aNewLogicalSize) {
  if (mLogicalSize >= aNewLogicalSize) {
    return NS_OK;
  }

  if (mTotalBlockCount == 0) {
    const auto rv = LoadNewBlockAtEnd();
    if (NS_FAILED(rv)) {
      return rv;
    }
  } else {
    BlockIndexType lastBlockIndex = mTotalBlockCount - 1;
    if (lastBlockIndex != mCurrentBlockIndex || !mBlockLoaded) {
      if (mBlockDirty) {
        const auto rv = SaveCurrentBlock();
        if (NS_FAILED(rv)) {
          return rv;
        }
      }
      const auto rv = LoadBlock(lastBlockIndex);
      if (NS_FAILED(rv)) {
        return rv;
      }
    }
  }

  while (mLogicalSize < aNewLogicalSize) {
    // The current block must always be the final block while this loop.
    MOZ_ASSERT(
        mCurrentBlockIndex == mTotalBlockCount ||
        (mTotalBlockCount > 0 && mCurrentBlockIndex == mTotalBlockCount - 1));

    auto fromOffset = mCurrentBlockTextLength;
    auto endOffset = aNewLogicalSize / sMaxTextLength == mCurrentBlockIndex
                         ? aNewLogicalSize % sMaxTextLength
                         : sMaxTextLength;

    MOZ_ASSERT(fromOffset <= endOffset);

    if (fromOffset < endOffset) {
      std::fill(mPlainBuffer.begin() + fromOffset,
                mPlainBuffer.begin() + endOffset, 0);

      mCurrentBlockTextLength = static_cast<TextLengthType>(endOffset);
      mLogicalSize += endOffset - fromOffset;
      mBlockDirty = true;
    }

    if (mLogicalSize < aNewLogicalSize) {
      if (mBlockDirty) {
        auto rv = SaveCurrentBlock();
        if (NS_FAILED(rv)) {
          return rv;
        }
      }

      auto rv = LoadNewBlockAtEnd();
      if (NS_FAILED(rv)) {
        return rv;
      }
    }
  }

  return NS_OK;
}

nsresult EncryptedRandomAccessStreamBase::LoadNewBlockAtEnd() {
  mPlainBuffer.fill(0u);
  mCurrentBlockIndex = mTotalBlockCount;
  mCurrentBlockTextLength = 0;
  mBlockLoaded = true;
  mBlockDirty = false;
  return NS_OK;
}

nsresult EncryptedRandomAccessStreamBase::GenerateRandomBytes(
    uint8_t* aBuffer, uint32_t aLength) {
  if (aLength == 0) {
    return NS_OK;
  }

  if (!mRandomGenerator) {
    mRandomGenerator =
        do_GetService("@mozilla.org/security/random-generator;1");
    if (NS_WARN_IF(!mRandomGenerator)) {
      return NS_ERROR_FAILURE;
    }
  }

  nsresult rv = mRandomGenerator->GenerateRandomBytesInto(aBuffer, aLength);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return rv;
  }

  return NS_OK;
}

nsresult EncryptedRandomAccessStreamBase::PadPlainBuffer() {
  if (mCurrentBlockTextLength < sMaxTextLength) {
    return GenerateRandomBytes(mPlainBuffer.data() + mCurrentBlockTextLength,
                               sMaxTextLength - mCurrentBlockTextLength);
  }

  return NS_OK;
}

//////////////////////////////////////////
// TODO: The below is NOT implemented yet.
//////////////////////////////////////////

NS_IMETHODIMP EncryptedRandomAccessStreamBase::SetEOF() {
  return NS_ERROR_NOT_IMPLEMENTED;
}

// TODO: NOT IMPLEMENTED

mozilla::ipc::RandomAccessStreamParams
EncryptedRandomAccessStreamBase::Serialize(nsIInterfaceRequestor*) {
  return {};
}

// TODO: NOT IMPLEMENTED

bool EncryptedRandomAccessStreamBase::Deserialize(
    mozilla::ipc::RandomAccessStreamParams&) {
  return false;
}

}  // namespace mozilla::dom::quota
