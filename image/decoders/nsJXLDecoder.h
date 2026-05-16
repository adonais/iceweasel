/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_image_decoders_nsJXLDecoder_h
#define mozilla_image_decoders_nsJXLDecoder_h

#include "Decoder.h"
#include "SurfacePipe.h"
#include "mozilla/Vector.h"
#include "mozilla/image/jxl_decoder_ffi.h"

namespace mozilla::image {

struct JxlDecoderDeleter {
  void operator()(JxlApiDecoder* ptr) { jxl_decoder_destroy(ptr); }
};

class nsJXLDecoder final : public Decoder {
 public:
  ~nsJXLDecoder() override;

  DecoderType GetType() const override { return DecoderType::JXL; }

 protected:
  nsresult InitInternal() override;
  LexerResult DoDecode(SourceBufferIterator& aIterator,
                       IResumable* aOnResume) override;

 private:
  friend class DecoderFactory;

  explicit nsJXLDecoder(RasterImage* aImage);

  enum class DecoderState { Initial, HaveBasicInfo };

  enum class FrameOutputResult {
    BufferAllocated,
    FrameAdvanced,
    DecodeComplete,
    NoOutput,
    Error
  };

  enum class ProcessResult { NeedMoreData, YieldOutput, Complete, Error };

  JxlDecoderStatus ProcessInput(const uint8_t** aData, size_t* aLength);
  FrameOutputResult HandleFrameOutput();
  ProcessResult ProcessAvailableData();

  LexerResult ScanForFrameCount(SourceBufferIterator& aIterator,
                                IResumable* aOnResume);

  FrameOutputResult BeginFrame();
  nsresult FinishFrame();
  void FlushPartialFrame();

  LexerResult DrainFrames();

  std::unique_ptr<JxlApiDecoder, JxlDecoderDeleter> mDecoder;
  std::unique_ptr<JxlApiDecoder, JxlDecoderDeleter> mScanner;

  DecoderState mDecoderState = DecoderState::Initial;

  uint32_t mFrameIndex = 0;

  Vector<uint8_t> mPixelBuffer;
  Maybe<SurfacePipe> mCurrentPipe;

  bool mIteratorComplete = false;

  Vector<uint8_t> mBufferedData;
  size_t mBytesConsumed = 0;
};

}  // namespace mozilla::image

#endif  // mozilla_image_decoders_nsJXLDecoder_h
