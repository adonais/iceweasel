/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AudioPacketizer_h_
#define AudioPacketizer_h_

#include <AudioSampleFormat.h>
#include <mozilla/Assertions.h>
#include <mozilla/Casting.h>
#include <mozilla/CheckedInt.h>
#include <mozilla/PodOperations.h>
#include <mozilla/UniquePtr.h>
#include <mozilla/UniquePtrExtensions.h>

#include "nsDebug.h"
#include "nsError.h"

// Enable this to warn when `Output` has been called but not enough data was
// buffered.
// #define LOG_PACKETIZER_UNDERRUN

namespace mozilla {
/**
 * This class takes arbitrary input data, and returns packets of a specific
 * size. In the process, it can convert audio samples from 16bit integers to
 * float (or vice-versa).
 *
 * Input and output, as well as length units in the public interface are
 * interleaved frames.
 *
 * Allocations of output buffer can be performed by this class.  Buffers can
 * simply be delete-d.  This is because packets are intended to be sent off to
 * non-gecko code using normal pointers/length pairs
 *
 * Alternatively, consumers can pass in a buffer in which the output is copied.
 * The buffer needs to be large enough to store a packet worth of audio.
 *
 * The implementation uses a circular buffer using absolute virtual indices.
 */
template <typename InputType, typename OutputType>
class AudioPacketizer {
 public:
  AudioPacketizer(uint32_t aPacketSize, uint32_t aChannels)
      : mPacketSize(aPacketSize),
        mChannels(aChannels),
        mReadIndex(0),
        mWriteIndex(0),
        // Start off with a single packet
        mStorage(new InputType[aPacketSize * aChannels]),
        mLength(aPacketSize * aChannels) {
    MOZ_ASSERT(aPacketSize > 0 && aChannels > 0,
               "The packet size and the number of channel should be strictly "
               "positive");
  }

  [[nodiscard]] nsresult Input(const InputType* aFrames, uint32_t aFrameCount) {
    CheckedUint32 inputSamples = CheckedUint32(aFrameCount) * mChannels;
    if (!inputSamples.isValid()) {
      NS_WARNING("AudioPacketizer::Input: frame count too large to buffer");
      return NS_ERROR_DOM_MEDIA_OVERFLOW_ERR;
    }
    // Need to grow the storage. This should rarely happen, if at all, once the
    // array has the right size.
    if (inputSamples.value() > EmptySlots()) {
      // Calls to Input and Output are roughtly interleaved
      // (Input,Output,Input,Output, etc.), or balanced
      // (Input,Input,Input,Output,Output,Output), so we update the buffer to
      // the exact right size in order to not waste space.
      CheckedUint32 newLength =
          CheckedUint32(AvailableSamples()) + inputSamples;
      if (!newLength.isValid()) {
        NS_WARNING("AudioPacketizer::Input: buffer size too large to grow");
        return NS_ERROR_DOM_MEDIA_OVERFLOW_ERR;
      }
      UniquePtr<InputType[]> newStorage =
          mozilla::MakeUniqueFallible<InputType[]>(newLength.value());
      if (!newStorage) {
        NS_WARNING("AudioPacketizer::Input: buffer allocation failed");
        return NS_ERROR_OUT_OF_MEMORY;
      }
      // Copy the old data at the beginning of the new storage.
      if (WriteIndex() >= ReadIndex()) {
        PodCopy(newStorage.get(), mStorage.get() + ReadIndex(),
                AvailableSamples());
      } else {
        uint32_t firstPartLength = mLength - ReadIndex();
        uint32_t secondPartLength = AvailableSamples() - firstPartLength;
        PodCopy(newStorage.get(), mStorage.get() + ReadIndex(),
                firstPartLength);
        PodCopy(newStorage.get() + firstPartLength, mStorage.get(),
                secondPartLength);
      }
      mStorage = std::move(newStorage);
      mWriteIndex -= mReadIndex;
      mReadIndex = 0;
      mLength = newLength.value();
    }

    if (WriteIndex() + inputSamples.value() <= mLength) {
      PodCopy(mStorage.get() + WriteIndex(), aFrames, inputSamples.value());
    } else {
      uint32_t firstPartLength = mLength - WriteIndex();
      uint32_t secondPartLength = inputSamples.value() - firstPartLength;
      PodCopy(mStorage.get() + WriteIndex(), aFrames, firstPartLength);
      PodCopy(mStorage.get(), aFrames + firstPartLength, secondPartLength);
    }

    mWriteIndex += inputSamples.value();
    return NS_OK;
  }

  OutputType* Output() {
    uint32_t samplesNeeded = mPacketSize * mChannels;
    OutputType* out = new OutputType[samplesNeeded];

    Output(out);

    return out;
  }

  // Return the number of actual frames dequeued -- this can be lower than the
  // packet size when underruning or draining.
  size_t Output(OutputType* aOutputBuffer) {
    uint32_t samplesNeeded = mPacketSize * mChannels;
    size_t rv = 0;

    // Under-run. Pad the end of the buffer with silence.
    if (AvailableSamples() < samplesNeeded) {
      rv = AvailableSamples() / mChannels;
#ifdef LOG_PACKETIZER_UNDERRUN
      char buf[256];
      snprintf(buf, 256,
               "AudioPacketizer %p underrun: available: %u, needed: %u\n", this,
               AvailableSamples(), samplesNeeded);
      NS_WARNING(buf);
#endif
      uint32_t zeros = samplesNeeded - AvailableSamples();
      PodZero(aOutputBuffer + AvailableSamples(), zeros);
      samplesNeeded -= zeros;
    } else {
      rv = mPacketSize;
    }
    if (ReadIndex() + samplesNeeded <= mLength) {
      ConvertAudioSamples<InputType, OutputType>(mStorage.get() + ReadIndex(),
                                                 aOutputBuffer, samplesNeeded);
    } else {
      uint32_t firstPartLength = mLength - ReadIndex();
      uint32_t secondPartLength = samplesNeeded - firstPartLength;
      ConvertAudioSamples<InputType, OutputType>(
          mStorage.get() + ReadIndex(), aOutputBuffer, firstPartLength);
      ConvertAudioSamples<InputType, OutputType>(
          mStorage.get(), aOutputBuffer + firstPartLength, secondPartLength);
    }
    mReadIndex += samplesNeeded;
    return rv;
  }

  void Clear() {
    mReadIndex = 0;
    mWriteIndex = 0;
  }

  uint32_t PacketsAvailable() const {
    return AvailableSamples() / mChannels / mPacketSize;
  }

  uint32_t FramesAvailable() const { return AvailableSamples() / mChannels; }

  bool Empty() const { return mWriteIndex == mReadIndex; }

  bool Full() const { return mWriteIndex - mReadIndex == mLength; }

  // Size of one packet of audio, in frames
  const uint32_t mPacketSize;
  // Number of channels of the stream flowing through this packetizer
  const uint32_t mChannels;

 private:
  uint32_t ReadIndex() const { return mReadIndex % mLength; }

  uint32_t WriteIndex() const { return mWriteIndex % mLength; }

  uint32_t AvailableSamples() const {
    // Output never advances mReadIndex past mWriteIndex (it clamps to the
    // available count on under-run), so the difference is never negative.
    // The live count is bounded by mLength (a uint32), so the cast is in range.
    MOZ_DIAGNOSTIC_ASSERT(mWriteIndex >= mReadIndex);
    return AssertedCast<uint32_t>(mWriteIndex - mReadIndex);
  }

  uint32_t EmptySlots() const { return mLength - AvailableSamples(); }

  // Two virtual index into the buffer: the read position and the write
  // position.
  uint64_t mReadIndex;
  uint64_t mWriteIndex;
  // Storage for the samples
  mozilla::UniquePtr<InputType[]> mStorage;
  // Length of the buffer, in samples
  uint32_t mLength;
};

}  // namespace mozilla

#endif  // AudioPacketizer_h_
