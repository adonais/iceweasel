/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ImageLogging.h"  // Must appear first

#include "nsJXLDecoder.h"

#include "AnimationParams.h"
#include "mozilla/CheckedInt.h"
#include "gfxPlatform.h"
#include "RasterImage.h"
#include "SurfacePipeFactory.h"

using namespace mozilla::gfx;

namespace mozilla::image {

static LazyLogModule sJXLLog("JXLDecoder");

nsJXLDecoder::nsJXLDecoder(RasterImage* aImage) : Decoder(aImage) {
  MOZ_LOG(sJXLLog, LogLevel::Debug,
          ("[this=%p] nsJXLDecoder::nsJXLDecoder", this));
}

nsresult nsJXLDecoder::InitInternal() {
  bool premultiply = !(GetSurfaceFlags() & SurfaceFlags::NO_PREMULTIPLY_ALPHA);

  qcms_profile* outputProfile = nullptr;
  const uint8_t* iccData = nullptr;
  size_t iccLen = 0;

  // All jpeg xl images are tagged with some color space info, so we provide an
  // output color space exactly when cms is not turned off completely.
  if (GetCMSOutputProfile() && mCMSMode != CMSMode::Off) {
    outputProfile = GetCMSOutputProfile();
    if (!qcms_profile_is_sRGB(GetCMSOutputProfile())) {
      const auto& outputICC = gfxPlatform::GetCMSOutputICCProfileData();
      if (outputICC.isSome() && !outputICC->IsEmpty()) {
        iccData = outputICC->Elements();
        iccLen = outputICC->Length();
      }
    }
  }

  mDecoder.reset(jxl_decoder_new(IsMetadataDecode(), premultiply,
                                 gfxPlatform::GetRenderingIntent(),
                                 outputProfile, iccData, iccLen));
  if (WantsFrameCount()) {
    mScanner.reset(jxl_scanner_new());
  }
  return NS_OK;
}

nsJXLDecoder::~nsJXLDecoder() {
  MOZ_LOG(sJXLLog, LogLevel::Debug,
          ("[this=%p] nsJXLDecoder::~nsJXLDecoder", this));
}

LexerResult nsJXLDecoder::DoDecode(SourceBufferIterator& aIterator,
                                   IResumable* aOnResume) {
  MOZ_ASSERT(!HasError(), "Shouldn't call DoDecode after error!");

  if (WantsFrameCount()) {
    return ScanForFrameCount(aIterator, aOnResume);
  }

  while (true) {
    // Process buffered data before fetching more.
    if (mBytesConsumed < mBufferedData.length()) {
      ProcessResult result = ProcessAvailableData();
      switch (result) {
        case ProcessResult::Error:
          return LexerResult(TerminalState::FAILURE);
        case ProcessResult::YieldOutput:
          return LexerResult(Yield::OUTPUT_AVAILABLE);
        case ProcessResult::Complete:
          return LexerResult(TerminalState::SUCCESS);
        case ProcessResult::NeedMoreData:
          if (mBytesConsumed >= mBufferedData.length()) {
            mBufferedData.clear();
            mBytesConsumed = 0;
          }
          break;
      }
    }

    if (mIteratorComplete) {
      return DrainFrames();
    }

    SourceBufferIterator::State state =
        aIterator.AdvanceOrScheduleResume(SIZE_MAX, aOnResume);
    mIteratorComplete = (state == SourceBufferIterator::COMPLETE);

    if (state == SourceBufferIterator::WAITING) {
      return LexerResult(Yield::NEED_MORE_DATA);
    }

    if (state == SourceBufferIterator::READY) {
      const uint8_t* chunkData =
          reinterpret_cast<const uint8_t*>(aIterator.Data());
      size_t chunkLength = aIterator.Length();

      if (chunkLength > 0) {
        if (!mBufferedData.append(chunkData, chunkLength)) {
          return LexerResult(TerminalState::FAILURE);
        }
      }
    }
  }
}

LexerResult nsJXLDecoder::ScanForFrameCount(SourceBufferIterator& aIterator,
                                            IResumable* aOnResume) {
  MOZ_ASSERT(mScanner);

  while (true) {
    SourceBufferIterator::State state =
        aIterator.AdvanceOrScheduleResume(SIZE_MAX, aOnResume);

    if (state == SourceBufferIterator::WAITING) {
      return LexerResult(Yield::NEED_MORE_DATA);
    }

    if (state == SourceBufferIterator::READY) {
      const uint8_t* data = reinterpret_cast<const uint8_t*>(aIterator.Data());
      size_t length = aIterator.Length();
      JxlDecoderStatus scanStatus =
          jxl_decoder_process_data(mScanner.get(), &data, &length, nullptr, 0);
      if (scanStatus == JxlDecoderStatus::Error) {
        return LexerResult(TerminalState::FAILURE);
      }
    }

    if (!HasSize()) {
      JxlBasicInfo info = jxl_decoder_get_basic_info(mScanner.get());
      if (info.valid) {
        if (info.width > INT32_MAX || info.height > INT32_MAX) {
          return LexerResult(TerminalState::FAILURE);
        }
        PostSize(info.width, info.height);
        if (info.has_alpha) {
          PostHasTransparency();
        }
        if (!info.is_animated) {
          PostFrameCount(1);
          return LexerResult(TerminalState::SUCCESS);
        }
      }
    }

    // Post animation info once we have at least one scanned frame.
    if (HasSize() && !HasAnimation()) {
      uint32_t scannedCount =
          jxl_decoder_get_scanned_frame_count(mScanner.get());
      if (scannedCount > 0) {
        JxlBasicInfo info = jxl_decoder_get_basic_info(mScanner.get());
        JxlFrameInfo frameInfo =
            jxl_decoder_get_scanned_frame_info(mScanner.get(), 0);
        PostIsAnimated(
            FrameTimeout::FromRawMilliseconds(frameInfo.duration_ms));
        PostLoopCount((info.num_loops == 0 || info.num_loops > INT32_MAX)
                          ? -1
                          : static_cast<int32_t>(info.num_loops));
      }
    }

    if (HasSize() && !jxl_decoder_has_more_frames(mScanner.get())) {
      uint32_t count = jxl_decoder_get_scanned_frame_count(mScanner.get());
      PostFrameCount(count);
      return LexerResult(TerminalState::SUCCESS);
    }

    if (state == SourceBufferIterator::COMPLETE) {
      if (!HasSize()) {
        return LexerResult(TerminalState::FAILURE);
      }
      uint32_t count = jxl_decoder_get_scanned_frame_count(mScanner.get());
      PostFrameCount(count > 0 ? count : 1);
      return LexerResult(TerminalState::SUCCESS);
    }
  }
}

nsJXLDecoder::ProcessResult nsJXLDecoder::ProcessAvailableData() {
  const uint8_t* data = mBufferedData.begin() + mBytesConsumed;
  size_t length = mBufferedData.length() - mBytesConsumed;

  while (true) {
    JxlDecoderStatus status = ProcessInput(&data, &length);

    switch (status) {
      case JxlDecoderStatus::Error:
        return ProcessResult::Error;

      case JxlDecoderStatus::NeedMoreData:
        if (!HasAnimation() && !mPixelBuffer.empty() && mCurrentPipe) {
          FlushPartialFrame();
        }
        mBytesConsumed = data - mBufferedData.begin();
        return ProcessResult::NeedMoreData;

      case JxlDecoderStatus::Ok: {
        if (mDecoderState == DecoderState::Initial) {
          JxlBasicInfo basicInfo = jxl_decoder_get_basic_info(mDecoder.get());
          if (!basicInfo.valid) {
            if (length == 0) {
              mBytesConsumed = mBufferedData.length();
              return ProcessResult::NeedMoreData;
            }
            continue;
          }

          if (basicInfo.width > INT32_MAX || basicInfo.height > INT32_MAX) {
            return ProcessResult::Error;
          }

          PostSize(basicInfo.width, basicInfo.height);
          if (basicInfo.has_alpha) {
            PostHasTransparency();
          }

          if (!basicInfo.is_animated) {
            PostFrameCount(1);
            if (IsMetadataDecode()) {
              return ProcessResult::Complete;
            }
          }

          mDecoderState = DecoderState::HaveBasicInfo;
        }

        if (mDecoderState == DecoderState::HaveBasicInfo) {
          if (jxl_decoder_is_frame_ready(mDecoder.get()) && !HasAnimation()) {
            JxlBasicInfo basicInfo = jxl_decoder_get_basic_info(mDecoder.get());
            if (basicInfo.is_animated) {
              JxlFrameInfo frameInfo =
                  jxl_decoder_get_frame_info(mDecoder.get());
              PostIsAnimated(
                  FrameTimeout::FromRawMilliseconds(frameInfo.duration_ms));
              PostLoopCount(
                  (basicInfo.num_loops == 0 || basicInfo.num_loops > INT32_MAX)
                      ? -1
                      : static_cast<int32_t>(basicInfo.num_loops));
              if (IsMetadataDecode()) {
                return ProcessResult::Complete;
              }
            }
          }
        }

        switch (HandleFrameOutput()) {
          case FrameOutputResult::BufferAllocated:
          case FrameOutputResult::NoOutput:
            continue;
          case FrameOutputResult::FrameAdvanced:
            mBytesConsumed = data - mBufferedData.begin();
            return ProcessResult::YieldOutput;
          case FrameOutputResult::DecodeComplete:
            return ProcessResult::Complete;
          case FrameOutputResult::Error:
            return ProcessResult::Error;
        }
        MOZ_CRASH("Unhandled FrameOutputResult");
      }
    }
  }
}

LexerResult nsJXLDecoder::DrainFrames() {
  while (true) {
    const uint8_t* noData = nullptr;
    size_t noLength = 0;
    JxlDecoderStatus status = ProcessInput(&noData, &noLength);

    switch (status) {
      case JxlDecoderStatus::Ok: {
        if (!HasSize()) {
          return LexerResult(TerminalState::FAILURE);
        }

        switch (HandleFrameOutput()) {
          case FrameOutputResult::BufferAllocated:
            break;
          case FrameOutputResult::FrameAdvanced:
            return LexerResult(Yield::OUTPUT_AVAILABLE);
          case FrameOutputResult::DecodeComplete:
          case FrameOutputResult::NoOutput:
            return LexerResult(TerminalState::SUCCESS);
          case FrameOutputResult::Error:
            return LexerResult(TerminalState::FAILURE);
        }
        break;
      }

      case JxlDecoderStatus::NeedMoreData:
        if (!HasSize()) {
          return LexerResult(TerminalState::FAILURE);
        }
        return LexerResult(TerminalState::SUCCESS);

      case JxlDecoderStatus::Error:
        return LexerResult(TerminalState::FAILURE);
    }
  }
}

JxlDecoderStatus nsJXLDecoder::ProcessInput(const uint8_t** aData,
                                            size_t* aLength) {
  uint8_t* bufferPtr = mPixelBuffer.empty() ? nullptr : mPixelBuffer.begin();
  size_t bufferLen = mPixelBuffer.length();
  return jxl_decoder_process_data(mDecoder.get(), aData, aLength, bufferPtr,
                                  bufferLen);
}

nsJXLDecoder::FrameOutputResult nsJXLDecoder::HandleFrameOutput() {
  bool frameNeedsBuffer = jxl_decoder_is_frame_ready(mDecoder.get());

  if (frameNeedsBuffer && mPixelBuffer.empty()) {
    return BeginFrame();
  }

  if (!frameNeedsBuffer && !mPixelBuffer.empty()) {
    nsresult rv = FinishFrame();
    if (NS_FAILED(rv)) {
      return FrameOutputResult::Error;
    }

    bool hasMoreFrames = jxl_decoder_has_more_frames(mDecoder.get());
    if (IsFirstFrameDecode() || !HasAnimation() || !hasMoreFrames) {
      PostFrameCount(mFrameIndex + 1);
      PostDecodeDone();
      return FrameOutputResult::DecodeComplete;
    }
    mFrameIndex++;
    mPixelBuffer.clear();
    return FrameOutputResult::FrameAdvanced;
  }

  return FrameOutputResult::NoOutput;
}

nsJXLDecoder::FrameOutputResult nsJXLDecoder::BeginFrame() {
  MOZ_ASSERT(HasSize());

  OrientedIntSize size = Size();
  CheckedInt<size_t> bufferSize =
      CheckedInt<size_t>(size.width) * size.height * 4;
  if (!bufferSize.isValid() || !mPixelBuffer.resize(bufferSize.value())) {
    MOZ_LOG(sJXLLog, LogLevel::Error,
            ("[this=%p] nsJXLDecoder::BeginFrame -- "
             "failed to allocate pixel buffer\n",
             this));
    return FrameOutputResult::Error;
  }

  JxlBasicInfo basicInfo = jxl_decoder_get_basic_info(mDecoder.get());

  Maybe<AnimationParams> animParams;
  if (HasAnimation()) {
    JxlFrameInfo frameInfo = jxl_decoder_get_frame_info(mDecoder.get());
    if (!frameInfo.frame_duration_valid) {
      return FrameOutputResult::Error;
    }
    animParams.emplace(FullFrame().ToUnknownRect(),
                       FrameTimeout::FromRawMilliseconds(frameInfo.duration_ms),
                       mFrameIndex, BlendMethod::SOURCE, DisposalMethod::KEEP);
  }

  SurfaceFormat inFormat = SurfaceFormat::R8G8B8A8;
  SurfaceFormat outFormat =
      basicInfo.has_alpha ? SurfaceFormat::OS_RGBA : SurfaceFormat::OS_RGBX;
  SurfacePipeFlags pipeFlags = SurfacePipeFlags();

  mCurrentPipe = SurfacePipeFactory::CreateSurfacePipe(
      this, size, OutputSize(), FullFrame(), inFormat, outFormat, animParams,
      nullptr, pipeFlags);
  if (!mCurrentPipe) {
    return FrameOutputResult::Error;
  }

  return FrameOutputResult::BufferAllocated;
}

nsresult nsJXLDecoder::FinishFrame() {
  MOZ_ASSERT(HasSize());
  MOZ_ASSERT(mDecoder);
  MOZ_ASSERT(mCurrentPipe);

  JxlBasicInfo basicInfo = jxl_decoder_get_basic_info(mDecoder.get());
  OrientedIntSize size = Size();

  mCurrentPipe->ResetToFirstRow();

  uint8_t* currentRow = mPixelBuffer.begin();
  for (int32_t y = 0; y < size.height; ++y) {
    WriteState result =
        mCurrentPipe->WriteBuffer(reinterpret_cast<uint32_t*>(currentRow));
    if (result == WriteState::FAILURE) {
      mCurrentPipe.reset();
      return NS_ERROR_FAILURE;
    }
    currentRow += size.width * 4;
  }

  if (Maybe<SurfaceInvalidRect> invalidRect = mCurrentPipe->TakeInvalidRect()) {
    PostInvalidation(invalidRect->mInputSpaceRect,
                     Some(invalidRect->mOutputSpaceRect));
  }

  PostFrameStop(basicInfo.has_alpha ? Opacity::SOME_TRANSPARENCY
                                    : Opacity::FULLY_OPAQUE);
  mCurrentPipe.reset();
  return NS_OK;
}

void nsJXLDecoder::FlushPartialFrame() {
  MOZ_ASSERT(!mPixelBuffer.empty());
  MOZ_ASSERT(mCurrentPipe);

  JxlDecoderStatus status = jxl_decoder_flush_pixels(
      mDecoder.get(), mPixelBuffer.begin(), mPixelBuffer.length());
  if (status != JxlDecoderStatus::Ok) {
    return;
  }

  OrientedIntSize size = Size();
  mCurrentPipe->ResetToFirstRow();
  uint8_t* currentRow = mPixelBuffer.begin();
  for (int32_t y = 0; y < size.height; ++y) {
    if (mCurrentPipe->WriteBuffer(reinterpret_cast<uint32_t*>(currentRow)) ==
        WriteState::FAILURE) {
      return;
    }
    currentRow += size.width * 4;
  }

  if (Maybe<SurfaceInvalidRect> invalidRect = mCurrentPipe->TakeInvalidRect()) {
    PostInvalidation(invalidRect->mInputSpaceRect,
                     Some(invalidRect->mOutputSpaceRect));
  }
}

}  // namespace mozilla::image
