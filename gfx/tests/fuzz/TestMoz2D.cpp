/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FuzzingInterface.h"
#include "FuzzingBufferReader.h"
#include "mozilla/webrender/webrender_ffi.h"

static int testInitMoz2D(int* argc, char*** argv) { return 0; }

static int testMoz2DRenderCallback(const uint8_t* buf, size_t size) {
  FuzzingBufferReader fuzzBuf(buf, size);

  uint8_t imageFormat;
  MOZ_TRY_VAR(imageFormat, fuzzBuf.Read<uint8_t>());

  mozilla::wr::LayoutIntRect renderRect;
  MOZ_TRY_VAR(renderRect.min.x, fuzzBuf.Read<int32_t>());
  MOZ_TRY_VAR(renderRect.min.y, fuzzBuf.Read<int32_t>());
  MOZ_TRY_VAR(renderRect.max.x, fuzzBuf.Read<int32_t>());
  MOZ_TRY_VAR(renderRect.max.y, fuzzBuf.Read<int32_t>());

  mozilla::wr::DeviceIntRect visibleRect;
  MOZ_TRY_VAR(visibleRect.min.x, fuzzBuf.Read<int32_t>());
  MOZ_TRY_VAR(visibleRect.min.y, fuzzBuf.Read<int32_t>());
  MOZ_TRY_VAR(visibleRect.max.x, fuzzBuf.Read<int32_t>());
  MOZ_TRY_VAR(visibleRect.max.y, fuzzBuf.Read<int32_t>());

  uint16_t tileSize;
  MOZ_TRY_VAR(tileSize, fuzzBuf.Read<uint16_t>());

  mozilla::wr::TileOffset tileOffset;
  if (tileSize) {
    MOZ_TRY_VAR(tileOffset.x, fuzzBuf.Read<int32_t>());
    MOZ_TRY_VAR(tileOffset.y, fuzzBuf.Read<int32_t>());
  }

  uint8_t haveDirtyRect;
  MOZ_TRY_VAR(haveDirtyRect, fuzzBuf.Read<uint8_t>());

  mozilla::wr::LayoutIntRect dirtyRect;
  if (!!haveDirtyRect) {
    MOZ_TRY_VAR(dirtyRect.min.x, fuzzBuf.Read<int32_t>());
    MOZ_TRY_VAR(dirtyRect.min.y, fuzzBuf.Read<int32_t>());
    MOZ_TRY_VAR(dirtyRect.max.x, fuzzBuf.Read<int32_t>());
    MOZ_TRY_VAR(dirtyRect.max.y, fuzzBuf.Read<int32_t>());
  }

  uint32_t outLength;
  MOZ_TRY_VAR(outLength, fuzzBuf.Read<uint32_t>());
  if (outLength >= 10 * 1024 * 1024) {
    return 0;
  }

  uint32_t blobLength = fuzzBuf.Length();
  // limit buffer lengths to prevent oom
  if (blobLength >= 10 * 1024 * 1024) {
    return 0;
  }

  UniquePtr<uint8_t[]> blobBuffer(new uint8_t[blobLength]);
  memcpy(blobBuffer.get(), fuzzBuf.Pos(), blobLength);

  UniquePtr<uint8_t[]> outBuffer(new uint8_t[outLength]);

  wr_moz2d_render_cb(mozilla::wr::ByteSlice{blobBuffer.get(), blobLength},
                     static_cast<mozilla::wr::ImageFormat>(imageFormat),
                     &renderRect, &visibleRect, tileSize,
                     tileSize ? &tileOffset : nullptr,
                     !!haveDirtyRect ? &dirtyRect : nullptr,
                     mozilla::wr::MutByteSlice{outBuffer.get(), outLength});

  return 0;
}

MOZ_FUZZING_INTERFACE_RAW(testInitMoz2D, testMoz2DRenderCallback, Moz2D);
