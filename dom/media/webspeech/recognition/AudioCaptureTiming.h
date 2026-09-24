/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_AUDIOCAPTURETIMING_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_AUDIOCAPTURETIMING_H_

#include <atomic>
#include <cstdint>

#include "mozilla/TimeStamp.h"

namespace mozilla {

// Extrapolates the capture time of aQueryPosition from a (position,
// timestamp) reference on the same constant-rate sample stream. Returns a
// null TimeStamp if aRefTimeStamp is null.
inline TimeStamp EstimateSampleTimeStamp(int64_t aRefPosition,
                                         TimeStamp aRefTimeStamp,
                                         int64_t aQueryPosition,
                                         double aSampleRate) {
  if (aRefTimeStamp.IsNull() || aSampleRate == 0) {
    return TimeStamp();
  }
  double framesAhead = double(aRefPosition - aQueryPosition);
  return aRefTimeStamp - TimeDuration::FromSeconds(framesAhead / aSampleRate);
}

// Wait-free single-producer/single-consumer triple buffer: Write() never
// blocks and Read() never sees a torn value, unlike two independent
// atomics. Same technique as media/libcubeb/src/cubeb_triple_buffer.h.
template <typename T>
class TripleBuffer {
 public:
  void Write(const T& aValue) {
    mStorage[mInputIndex] = aValue;
    uint8_t formerBack =
        mState.exchange(mInputIndex | kDirtyBit, std::memory_order_acq_rel);
    mInputIndex = formerBack & kIndexMask;
  }
  T Read() {
    if (mState.load(std::memory_order_relaxed) & kDirtyBit) {
      uint8_t formerBack =
          mState.exchange(mOutputIndex, std::memory_order_acq_rel);
      mOutputIndex = formerBack & kIndexMask;
    }
    return mStorage[mOutputIndex];
  }

 private:
  static constexpr uint8_t kIndexMask = 0b11;
  static constexpr uint8_t kDirtyBit = 0b100;
  T mStorage[3] = {};
  std::atomic<uint8_t> mState{0};
  uint8_t mOutputIndex = 1;
  uint8_t mInputIndex = 2;
};

// Producer-side reference point for EstimateSampleTimeStamp(): a sample
// position and the wall-clock time (microseconds since process creation,
// to keep this trivially copyable) it was observed at.
struct SampleTimeReference {
  int64_t mPosition = 0;
  int64_t mTimeUs = 0;
};

}  // namespace mozilla

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_AUDIOCAPTURETIMING_H_
