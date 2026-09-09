/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ENCRYPTEDRANDOMACCESSSTREAM_IMPL_H_
#define DOM_QUOTA_ENCRYPTEDRANDOMACCESSSTREAM_IMPL_H_

#include <cstring>

#include "EncryptedRandomAccessBlockView.h"
#include "EncryptedRandomAccessStream.h"
#include "ErrorList.h"
#include "NSSRandomAccessCipherStrategy.h"
#include "mozilla/Assertions.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/EndianUtils.h"
#include "mozilla/NotNull.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Result.h"
#include "mozilla/ResultExtensions.h"
#include "mozilla/dom/quota/QuotaCommon.h"
#include "mozilla/dom/quota/ResultExtensions.h"
#include "mozilla/ipc/FileDescriptor.h"
#include "mozilla/ipc/RandomAccessStreamParams.h"
#include "mozilla/ipc/RandomAccessStreamUtils.h"
#include "nsError.h"
#include "nsIRandomAccessStream.h"
#include "nsISeekableStream.h"
#include "nscore.h"

namespace mozilla::dom::quota {

template <typename CipherStrategy>
EncryptedRandomAccessStream<CipherStrategy>::~EncryptedRandomAccessStream() =
    default;

template <typename CipherStrategy>
Result<RefPtr<EncryptedRandomAccessStream<CipherStrategy>>, nsresult>
EncryptedRandomAccessStream<CipherStrategy>::Create(
    CipherStrategy aStrategy,
    MovingNotNull<nsCOMPtr<nsIRandomAccessStream>> aStream,
    typename CipherStrategy::KeyType aMasterKey) {
  auto stream = MakeRefPtr<EncryptedRandomAccessStream<CipherStrategy>>(
      std::move(aStream), aMasterKey);

  uint64_t baseStreamSize;
  auto rv = stream->mBaseStream->Seek(NS_SEEK_SET, 0);
  if (NS_FAILED(rv)) {
    return Err(rv);
  }
  rv = stream->mBaseStream->InputStream()->Available(&baseStreamSize);
  if (NS_FAILED(rv)) {
    return Err(rv);
  }

  if (baseStreamSize % sBlockSize) {
    return Err(NS_ERROR_CORRUPTED_CONTENT);
  }

  stream->mTotalBlockCount = baseStreamSize / sBlockSize;
  if (stream->mTotalBlockCount == 0) {
    stream->mLogicalSize = 0;
    return stream;
  }

  auto lastBlockIndex = stream->mTotalBlockCount - 1;
  // Because all non-final blocks contain |sMaxTextLength| bytes of logical
  // text, we need the text size of the last block to derive the logical
  // stream size from the physical file size. |LoadBlock()| sets it to
  // |mCurrentBlockTextLength|.
  rv = stream->LoadBlock(lastBlockIndex);
  if (NS_FAILED(rv)) {
    return Err(rv);
  }
  const auto logicalSize = CheckedInt64(lastBlockIndex) * sMaxTextLength +
                           stream->mCurrentBlockTextLength;
  if (!logicalSize.isValid()) {
    return Err(NS_ERROR_FILE_TOO_BIG);
  }
  stream->mLogicalSize = logicalSize.value();

  return stream;
}

template <typename CipherStrategy>
nsresult EncryptedRandomAccessStream<CipherStrategy>::LoadBlock(
    BlockIndexType aBlockIndex) {
  // |LoadBlock()| must only be called for a block that exists on disk.
  // This also keeps |mTotalBlockCount - 1| below from underflowing.
  if (aBlockIndex >= mTotalBlockCount) {
    return NS_ERROR_UNEXPECTED;
  }

  EncryptedRandomAccessBlock encryptedBlock;
  auto rv = ReadEncryptedBlockFromBaseStream(aBlockIndex, encryptedBlock);
  if (NS_FAILED(rv)) {
    return rv;
  }

  const auto version = encryptedBlock.Version();
  switch (version) {
    case 1: {
      rv = DecryptBlockVersion1(encryptedBlock, aBlockIndex);
      if (NS_FAILED(rv)) {
        return rv;
      }
      break;
    }
    default: {
      return NS_ERROR_CORRUPTED_CONTENT;
    }
  }

  mCurrentBlockIndex = aBlockIndex;
  mBlockLoaded = true;
  mBlockDirty = false;

  return NS_OK;
}

template <typename CipherStrategy>
nsresult EncryptedRandomAccessStream<CipherStrategy>::DecryptBlockVersion1(
    EncryptedRandomAccessBlock& aEncryptedBlock, BlockIndexType aBlockIndex) {
  EncryptedRandomAccessBlockCipherMetadataViewV1 metadataView(
      aEncryptedBlock.MutableCipherMetadata());

  const auto aad = BuildAad(aEncryptedBlock, aBlockIndex);

  typename CipherStrategy::DecryptionInput dInput{
      .mMasterKey = mMasterKey,
      .mBlockNumber = aBlockIndex,
      .mNonce = metadataView.MutableNonce(),
      .mCiphertext = aEncryptedBlock.CipherPayload(),
      .mAad = aad,
      .mTag = metadataView.MutableAuthenticationTag(),
  };
  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize> plaintext;
  typename CipherStrategy::DecryptionOutput dOutput{.mPlaintext = plaintext};
  auto rv = CipherStrategy::Decrypt(dInput, dOutput);
  if (NS_FAILED(rv)) {
    return NS_ERROR_CORRUPTED_CONTENT;
  }

  DecryptedRandomAccessBlockCipherPayloadView payloadView(plaintext);
  auto textSize = payloadView.TextLength();
  if (textSize > sMaxTextLength) {
    return NS_ERROR_CORRUPTED_CONTENT;
  }
  // All blocks except the last one must be filled to the maximum length.
  if (aBlockIndex < mTotalBlockCount - 1 && textSize != sMaxTextLength) {
    return NS_ERROR_CORRUPTED_CONTENT;
  }
  mCurrentBlockTextLength = textSize;
  memcpy(mPlainBuffer.data(), payloadView.MutableTextAndPadding().Elements(),
         sMaxTextLength);

  return NS_OK;
}

template <typename CipherStrategy>
nsresult EncryptedRandomAccessStream<CipherStrategy>::EncryptBlockVersion1(
    EncryptedRandomAccessBlock& aEncryptedBlock, BlockIndexType aBlockIndex) {
  const auto aad = BuildAad(aEncryptedBlock, aBlockIndex);
  auto nonce = CipherStrategy::MakeBlockNonce();

  auto rv = PadPlainBuffer();
  if (NS_FAILED(rv)) {
    return rv;
  }

  std::array<uint8_t, sTextLengthFieldSize + sMaxTextLength> payload{};
  auto payloadSize = mCurrentBlockTextLength;
  mozilla::LittleEndian::writeUint16(payload.data(), payloadSize);
  memcpy(payload.data() + sTextLengthFieldSize, mPlainBuffer.data(),
         sMaxTextLength);

  const typename CipherStrategy::EncryptionInput eInput{
      .mMasterKey = mMasterKey,
      .mBlockNumber = aBlockIndex,
      .mNonce = nonce,
      .mPlaintext = payload,
      .mAad = aad,
  };

  std::array<uint8_t, EncryptedRandomAccessBlock::CipherPayloadSize> cipherText;
  std::array<
      uint8_t,
      EncryptedRandomAccessBlockCipherMetadataViewV1::AuthenticationTagSize>
      tag;
  typename CipherStrategy::EncryptionOutput eOutput{
      .mCiphertext = cipherText,
      .mTag = tag,
  };

  rv = CipherStrategy::Encrypt(eInput, eOutput);
  if (NS_FAILED(rv)) {
    return NS_ERROR_CORRUPTED_CONTENT;
  }

  EncryptedRandomAccessBlockCipherMetadataViewV1 view(
      aEncryptedBlock.MutableCipherMetadata());
  memcpy(view.MutableNonce().data(), nonce.data(), nonce.size());
  memcpy(view.MutableAuthenticationTag().data(), tag.data(), tag.size());
  memcpy(aEncryptedBlock.MutableCipherPayload().data(), cipherText.data(),
         cipherText.size());

  return NS_OK;
}

template <typename CipherStrategy>
nsresult EncryptedRandomAccessStream<CipherStrategy>::SaveCurrentBlock() {
  if (!mBlockDirty) {
    return NS_OK;
  }

  if (mCurrentBlockIndex > mTotalBlockCount) {
    return NS_ERROR_CORRUPTED_CONTENT;
  }

  // NOTE: When information held in the original block's header or metadata is
  // needed, the block must be read back from the base stream. But with the
  // current |EncryptedRandomAccessBlock| V1 that isn't necessary, so build a
  // fresh block to avoid the extra I/O.
  EncryptedRandomAccessBlock encryptedBlock;
  const bool newBlock = mCurrentBlockIndex == mTotalBlockCount;

  const auto version = encryptedBlock.Version();
  switch (version) {
    case 1: {
      const auto rv = EncryptBlockVersion1(encryptedBlock, mCurrentBlockIndex);
      if (NS_FAILED(rv)) {
        return rv;
      }
      break;
    }
    default: {
      return NS_ERROR_CORRUPTED_CONTENT;
    }
  }

  auto rv = WriteEncryptedBlockToBaseStream(mCurrentBlockIndex, encryptedBlock);
  if (NS_FAILED(rv)) {
    return rv;
  }

  if (newBlock) {
    mTotalBlockCount++;
  }

  mBlockDirty = false;

  return NS_OK;
}

template <typename CipherStrategy>
mozilla::ipc::RandomAccessStreamParams
EncryptedRandomAccessStream<CipherStrategy>::Serialize(nsIInterfaceRequestor*) {
  MOZ_ASSERT_UNREACHABLE(
      "Only |EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>| can "
      "be serialized.");
  // In an opt build, the above macro becomes a no-op. So it's necessary to add
  // a return statement in order to prevent a build error.
  return mozilla::ipc::RandomAccessStreamParams();
}

template <>
inline mozilla::ipc::RandomAccessStreamParams
EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>::Serialize(
    nsIInterfaceRequestor* aCallbacks) {
  MOZ_ASSERT(!mClosed);

  mozilla::ipc::NSSEncryptedRandomAccessStreamParams params;

  const auto rv = SaveCurrentBlock();
  if (NS_FAILED(rv)) {
    // |Serialize| cannot fail, so a failure is expressed as params the peer
    // rejects, i.e. an invalid file descriptor and an empty master key.
    // |baseStreamParams| still needs to be assigned a value, otherwise a fatal
    // IPC error happens.
    NS_WARNING(
        "Failed to save the current block, so sending invalid parameters to "
        "the other process!");

    params.baseStreamParams() = mozilla::ipc::FileRandomAccessStreamParams(
        mozilla::ipc::FileDescriptor(), /* behaviorFlags */ 0);
    // We are already on the failure path, so there's nothing else we can do
    // here.
    mBaseStream->InputStream()->Close();
    mClosed = true;

    return params;
  }

  MovingNotNull<nsCOMPtr<nsIRandomAccessStream>> baseStream = mBaseStream;
  auto baseStreamParams = mozilla::ipc::SerializeRandomAccessStream(
      std::move(baseStream), aCallbacks);
  params.baseStreamParams() = std::move(baseStreamParams);

  params.masterKey().AppendElements(
      NSSRandomAccessCipherStrategy::SerializeKey(mMasterKey));

  // |Close()| can't be used here: it would fail flushing the base stream that
  // the base stream's own |Serialize| has already closed.
  mClosed = true;

  return params;
}

template <typename CipherStrategy>
Result<RefPtr<EncryptedRandomAccessStream<CipherStrategy>>, nsresult>
EncryptedRandomAccessStream<CipherStrategy>::CreateFromParams(
    mozilla::ipc::RandomAccessStreamParams&) {
  MOZ_ASSERT_UNREACHABLE(
      "Only |EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>| can "
      "be deserialized.");
  // In an opt build, the above macro becomes a no-op. So it's necessary to add
  // a return statement in order to prevent a build error.
  return Err(NS_ERROR_NOT_IMPLEMENTED);
}

template <>
inline Result<
    RefPtr<EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>>,
    nsresult>
EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>::CreateFromParams(
    mozilla::ipc::RandomAccessStreamParams& aParams) {
  NSSRandomAccessCipherStrategy strategy;
  QM_TRY(MOZ_TO_RESULT(strategy.Init()));

  auto& params = aParams.get_NSSEncryptedRandomAccessStreamParams();

  auto masterKeyRes =
      NSSRandomAccessCipherStrategy::DeserializeKey(params.masterKey());
  if (masterKeyRes.isNothing()) {
    // The failure of serialization on the other process ends up here.
    return Err(NS_ERROR_FAILURE);
  }
  auto masterKey = masterKeyRes.value();

  QM_TRY_UNWRAP(MovingNotNull<nsCOMPtr<nsIRandomAccessStream>> baseStream,
                DeserializeRandomAccessStream(params.baseStreamParams()),
                Err(NS_ERROR_FAILURE));

  return EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>::Create(
      strategy, std::move(baseStream), masterKey);
}

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_ENCRYPTEDRANDOMACCESSSTREAM_IMPL_H_
