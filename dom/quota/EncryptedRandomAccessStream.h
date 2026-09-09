/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_ENCRYPTEDRANDOMACCESSSTREAM_H_
#define DOM_QUOTA_ENCRYPTEDRANDOMACCESSSTREAM_H_

#include <array>

#include "EncryptedRandomAccessBlock.h"
#include "EncryptedRandomAccessBlockView.h"
#include "ErrorList.h"
#include "NSSRandomAccessCipherStrategy.h"
#include "mozilla/NotNull.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Result.h"
#include "nsCOMPtr.h"
#include "nsError.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsIRandomAccessStream.h"
#include "nsIRandomGenerator.h"
#include "nsISeekableStream.h"
#include "nsStreamUtils.h"
#include "nscore.h"

namespace mozilla::dom::quota {

/**
 * |EncryptedRandomAccessStream| provides random access to plaintext backed by a
 * sequence of |EncryptedRandomAccessBlock| objects. See
 * |EncryptedRandomAccessBlock| and the corresponding view classes for the
 * on-disk layout.
 *
 * The stream exposes plaintext offsets. These differ from physical offsets in
 * the encrypted base stream, where each block has the fixed size |sBlockSize|.
 * On top of its plaintext, every block also stores per-block overhead that the
 * stream never exposes: a plaintext header, the cipher metadata, and, inside
 * the decrypted payload, a text-length field (see |EncryptedRandomAccessBlock|
 * and |DecryptedRandomAccessBlockCipherPayloadView|). |mLogicalPosition| and
 * |mLogicalSize| count only the plaintext text bytes and exclude all of this
 * overhead, as well as the padding in the final block. All non-final blocks
 * hold |sMaxTextLength| text bytes; only the final block may hold fewer.
 *
 * For example, a base stream containing three encrypted blocks:
 *
 *   On-disk layout, where "ovhd" is the header, metadata and text-length field.
 *   Each block occupies |sBlockSize| bytes:
 *
 *   +----------------------+----------------------+----------------------+
 *   | ovhd |    text 0     | ovhd |    text 1     | ovhd | text 2 | pad   |
 *   +----------------------+----------------------+----------------------+
 *      block 0                block 1               block 2 (final)
 *
 *   Plaintext the stream exposes, i.e. the texts concatenated with the overhead
 *   and padding removed:
 *
 *                         mLogicalPosition = sMaxTextLength + X
 *                                          |
 *                                          v
 *   +----------------------+----------------------+-----------+
 *   |                      |<----- X ----->|      |           |
 *   |<-- sMaxTextLength -->|<-- sMaxTextLength -->|<--- Y --->|
 *   +----------------------+----------------------+-----------+
 *   |<-------- mLogicalSize = 2 * sMaxTextLength + Y -------->|
 *
 *   mTotalBlockCount = 3
 *
 * Physical I/O is delayed where possible. For example, |Seek()| updates only
 * the logical position. A block is loaded when a subsequent read needs it. But,
 * only the final block is loaded eagerly by |Create()| to derive
 * |mLogicalSize|. Other blocks are loaded lazily when a read needs them. So,
 * malformed non-final blocks may not be detected until they are read.
 *
 * Rules of blocks:
 *
 * A block can be in three places: the in-memory current block, the base stream
 * (not necessarily synced to disk), and the disk.
 * |LoadBlock()| reads a block from the base stream into memory,
 * |SaveCurrentBlock()| writes the current block to the base stream, and only
 * |Flush()| / |Close()| sync the base stream to disk.
 *
 *  - |mTotalBlockCount| is the number of encrypted blocks written to the base
 *    stream. It is derived from the base stream size in |Create()| and only
 *    ever bumped by |SaveCurrentBlock()| after it writes a brand-new block to
 *    the base stream.
 *
 *  - While |mBlockLoaded|, a single "current block" is held in memory,
 *    represented by its plaintext (|mPlainBuffer|) and valid length
 *    (|mCurrentBlockTextLength|). When loaded, |mCurrentBlockIndex| relates to
 *    the base stream as follows
 *    (|mCurrentBlockIndex > mTotalBlockCount| is never valid):
 *
 *      block index:     0        1        2     |  3 == mTotalBlockCount
 *                    +--------+--------+--------+ +- - - - - - +
 *      base stream:  | block0 | block1 | block2 | |   (none)   |
 *                    +--------+--------+--------+ +- - - - - - +
 *                    |<-------- written ------->| |<- memory ->|
 *                                                     only
 *      mCurrentBlockIndex <  mTotalBlockCount: a block in the base stream
 *      mCurrentBlockIndex == mTotalBlockCount: a pending append block, not in
 *                                              the base stream yet (created in
 *                                              memory by
 *                                              |LoadNewBlockAtEnd()|)
 *
 *  - |LoadBlock()| reads blocks from the base stream. That means it rejects
 *    |aBlockIndex >= mTotalBlockCount|. So it doesn't read an in-memory block
 *    not yet on the stream.
 *
 *  - |LoadNewBlockAtEnd()| only sets up the pending append block in memory,
 *    doing no I/O.
 *
 *  - Only the current block can be |mBlockDirty|, and it is always written to
 *    the base stream before moving to another block.
 *
 *  - I/O never relies on the base stream cursor position: every read/write
 *    explicitly seeks first.
 *
 * This class also implements |nsIInputStream| and |nsIOutputStream| so it can
 * be used with facilities such as |NS_AsyncCopy|.
 */
class EncryptedRandomAccessStreamBase : public nsIRandomAccessStream,
                                        public nsIInputStream,
                                        public nsIOutputStream {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_DECL_NSITELLABLESTREAM
  NS_DECL_NSISEEKABLESTREAM
  NS_DECL_NSIOUTPUTSTREAM

  // nsIInputStream
  NS_IMETHOD Read(char* aBuf, uint32_t aCount, uint32_t* _retval) override;
  NS_IMETHOD ReadSegments(nsWriteSegmentFun aWriter, void* aClosure,
                          uint32_t aCount, uint32_t* _retval) override;
  NS_IMETHOD Available(uint64_t* _retval) override;

  // nsIRandomAccessStream
  NS_IMETHOD GetInputStream(nsIInputStream** _retval) override;
  NS_IMETHOD GetOutputStream(nsIOutputStream** _retval) override;
  nsIInputStream* InputStream(void) override;
  nsIOutputStream* OutputStream(void) override;
  bool Deserialize(mozilla::ipc::RandomAccessStreamParams& params) override;
  mozilla::ipc::RandomAccessStreamParams Serialize(
      nsIInterfaceRequestor* aCallbacks) override = 0;

 protected:
  using BlockIndexType = uint64_t;
  using TextLengthType =
      DecryptedRandomAccessBlockCipherPayloadView::TextLengthType;
  using AadType = std::array<uint8_t, EncryptedRandomAccessBlock::HeaderSize +
                                          sizeof(BlockIndexType)>;

  EncryptedRandomAccessStreamBase(
      MovingNotNull<nsCOMPtr<nsIRandomAccessStream>> aStream)
      : mBaseStream(std::move(aStream)) {}

  virtual ~EncryptedRandomAccessStreamBase() = default;

  static constexpr auto sBlockSize = EncryptedRandomAccessBlock::BlockSize;
  static constexpr auto sTextLengthFieldSize =
      DecryptedRandomAccessBlockCipherPayloadView::TextLengthFieldSize;
  static constexpr auto sMaxTextLength =
      DecryptedRandomAccessBlockCipherPayloadView::MaxTextLength;

  virtual nsresult LoadBlock(BlockIndexType aBlockIndex) = 0;

  nsresult LoadNewBlockAtEnd();

  virtual nsresult SaveCurrentBlock() = 0;

  nsresult ReadEncryptedBlockFromBaseStream(
      BlockIndexType aBlockIndex, EncryptedRandomAccessBlock& aEncryptedBlock);

  nsresult WriteEncryptedBlockToBaseStream(
      BlockIndexType aBlockIndex,
      const EncryptedRandomAccessBlock& aEncryptedBlock);

  nsresult ZeroExtendTo(uint64_t aNewLogicalSize);

  nsresult PadPlainBuffer();

  nsresult GenerateRandomBytes(uint8_t* aBuffer, uint32_t aLength);

  static AadType BuildAad(const EncryptedRandomAccessBlock& aEncryptedBlock,
                          BlockIndexType aBlockIndex);

  // Because the current cipher strategies for random access are
  // stateless, this class doesn't have to own a strategy.
  const NotNull<nsCOMPtr<nsIRandomAccessStream>> mBaseStream;
  nsCOMPtr<nsIRandomGenerator> mRandomGenerator;

  // |mLogicalPosition| is the current read/write position and |mLogicalSize| is
  // the total size of the plaintext stream, both measured in plaintext bytes
  // from the start of the plaintext stream (see the class comment). These are
  // not physical offsets into the encrypted base stream.
  // They use |uint64_t|, because the file behind the
  // stream can be large.
  uint64_t mLogicalPosition = 0;
  uint64_t mLogicalSize = 0;  // It's initialized in |Create()|.

  BlockIndexType mTotalBlockCount = 0;  // It's initialized in |Create()|.
  BlockIndexType mCurrentBlockIndex = 0;

  std::array<uint8_t, sMaxTextLength> mPlainBuffer{};
  TextLengthType mCurrentBlockTextLength = 0;

  bool mBlockLoaded = false;
  bool mBlockDirty = false;

  bool mClosed = false;
};

template <typename CipherStrategy>
class EncryptedRandomAccessStream final
    : public EncryptedRandomAccessStreamBase {
 public:
  /**
   * Creating the stream can fail because initialization reads the final block
   * to derive the logical plaintext size and validate its format.
   */
  static Result<RefPtr<EncryptedRandomAccessStream<CipherStrategy>>, nsresult>
  Create(CipherStrategy aStrategy,
         MovingNotNull<nsCOMPtr<nsIRandomAccessStream>> aStream,
         typename CipherStrategy::KeyType aMasterKey);

  /**
   * Serializing saves the current block and then closes this stream, just like
   * |nsFileRandomAccessStream::Serialize| closes itself once it has handed out
   * its file descriptor. The logical position is not part of the parameters, so
   * the deserialized stream starts at zero.
   *
   * Currently only implemented for |NSSRandomAccessCipherStrategy|.
   */
  mozilla::ipc::RandomAccessStreamParams Serialize(
      nsIInterfaceRequestor* aCallbacks) override;

  /**
   * Alternative for |Deserialize|.
   *
   * The usual deserialization path constructs an empty stream and then restores
   * its members through |Deserialize|. |EncryptedRandomAccessStream| does not
   * fit that pattern: it must be built through |Create|, which requires a valid
   * base stream and master key already in place. This factory therefore
   * deserializes the base stream and key first and then goes through |Create|,
   * instead of restoring members onto an already-constructed instance.
   *
   * Currently only implemented for |NSSRandomAccessCipherStrategy|.
   */
  static Result<RefPtr<EncryptedRandomAccessStream<CipherStrategy>>, nsresult>
  CreateFromParams(mozilla::ipc::RandomAccessStreamParams& aParams);

 private:
  template <typename T, typename... Args>
  friend RefPtr<T> mozilla::MakeRefPtr(Args&&... aArgs);

  // This class must be initialized by |Create()|.
  EncryptedRandomAccessStream(
      MovingNotNull<nsCOMPtr<nsIRandomAccessStream>> aStream,
      typename CipherStrategy::KeyType aMasterKey)
      : EncryptedRandomAccessStreamBase(std::move(aStream)),
        mMasterKey(aMasterKey) {}

  ~EncryptedRandomAccessStream();

  nsresult LoadBlock(BlockIndexType aBlockIndex) override;

  nsresult SaveCurrentBlock() override;

  nsresult EncryptBlockVersion1(EncryptedRandomAccessBlock& aEncryptedBlock,
                                BlockIndexType aBlockIndex);

  nsresult DecryptBlockVersion1(EncryptedRandomAccessBlock& aEncryptedBlock,
                                BlockIndexType aBlockIndex);

  // Because the current cipher strategies for random access are
  // stateless, this class doesn't have to own a strategy.
  const typename CipherStrategy::KeyType mMasterKey;
};

template <>
mozilla::ipc::RandomAccessStreamParams
EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>::Serialize(
    nsIInterfaceRequestor* aCallbacks);

template <>
Result<RefPtr<EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>>,
       nsresult>
EncryptedRandomAccessStream<NSSRandomAccessCipherStrategy>::CreateFromParams(
    mozilla::ipc::RandomAccessStreamParams& aParams);

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_ENCRYPTEDRANDOMACCESSSTREAM_H_
