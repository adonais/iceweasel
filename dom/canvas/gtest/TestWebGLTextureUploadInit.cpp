/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <vector>

#include "WebGLContext.h"
#include "WebGLTexture.h"
#include "WebGLTypes.h"
#include "gfxPlatform.h"
#include "gtest/gtest.h"
#include "mozilla/gfx/2D.h"

namespace mozilla {

namespace {

constexpr uint32_t kTexSize = 16;
constexpr uint32_t kSubSize = kTexSize / 2;

constexpr webgl::PackingInfo kPI = {LOCAL_GL_RGBA, LOCAL_GL_UNSIGNED_BYTE};

constexpr GLenum kDXT5 = LOCAL_GL_COMPRESSED_RGBA_S3TC_DXT5_EXT;
constexpr uint32_t kDXT5BlockSize = 4;
constexpr uint32_t kDXT5BytesPerBlock = 16;

// CompressedTexImage requires the source buffer size to match exactly.
uint32_t DXT5ByteCount(const uvec3& aSize) {
  const auto fnBlocks = [](uint32_t aPixels) {
    return (aPixels + kDXT5BlockSize - 1) / kDXT5BlockSize;
  };
  return fnBlocks(aSize.x) * fnBlocks(aSize.y) * kDXT5BytesPerBlock * aSize.z;
}

// Mock source surface which passes upload validation but fails when mapped for
// read, so the upload fails only after the point at which slices used to be
// marked initialized. Returning real data here would defeat the tests below.
class UnmappableSourceSurface final : public gfx::DataSourceSurface {
 public:
  MOZ_DECLARE_REFCOUNTED_VIRTUAL_TYPENAME(UnmappableSourceSurface, override)

  explicit UnmappableSourceSurface(uint32_t aSize) : mSize(aSize, aSize) {}

  gfx::IntSize GetSize() const override { return mSize; }
  gfx::SurfaceFormat GetFormat() const override {
    return gfx::SurfaceFormat::B8G8R8A8;
  }
  uint8_t* GetData() override { return nullptr; }
  int32_t Stride() override { return 0; }

 private:
  const gfx::IntSize mSize;
};

}  // namespace

// Note: these tests only cover upload failure for TexImage, because it is the
// only one of the three UploadInitMemTracker call sites with an injectable
// failure seam (the caller-supplied source surface above). CompressedTexImage
// and CopyTexImage take only PODs and fail solely on driver errors, and both
// Truncate() the level on failure, which resets mUninitializedSlices anyway.
class WebGLTextureUploadInit : public ::testing::Test {
 protected:
  RefPtr<WebGLContext> mWebgl;
  RefPtr<WebGLTexture> mTex;

  void SetUp() override {
    gfxPlatform::GetPlatform();

    webgl::InitContextDesc desc;
    desc.isWebgl2 = true;
    desc.size = {kTexSize, kTexSize};
    webgl::InitContextResult initResult;

    mWebgl = WebGLContext::Create(nullptr, desc, &initResult);
    if (!mWebgl) {
      GTEST_SKIP() << "No usable WebGL context in this environment: "
                   << initResult.error->c_str();
    }

    mTex = mWebgl->CreateTexture();
    ASSERT_TRUE(mTex);
  }

  void ExpectNoError(const char* aWhen) {
    EXPECT_EQ(mWebgl->GetError(), 0u) << aWhen;
  }

  void ExpectError(GLenum aExpected, const char* aWhen) {
    EXPECT_EQ(mWebgl->GetError(), aExpected) << aWhen;
  }

  bool EnableS3TC() {
    constexpr auto id = WebGLExtensionID::WEBGL_compressed_texture_s3tc;
    if (!mWebgl->IsExtensionSupported(id)) {
      return false;
    }
    mWebgl->RequestExtension(id);
    return true;
  }

  void BindAndAllocUninitialized(GLenum aTexTarget, uint32_t aDepth = 1) {
    mWebgl->BindTexture(aTexTarget, mTex);

    webgl::TexUnpackBlobDesc alloc = {aTexTarget, {kTexSize, kTexSize, aDepth}};
    alloc.unpacking.rowLength = kTexSize;
    alloc.unpacking.imageHeight = kTexSize;
    mWebgl->TexImage(0, LOCAL_GL_RGBA, {0, 0, 0}, kPI, alloc);
  }

  // TexStorage is the only way to get an uninitialized compressed image; a
  // non-sub CompressedTexImage always ends up with no uninitialized slices.
  void BindAndAllocUninitializedCompressed() {
    mWebgl->BindTexture(LOCAL_GL_TEXTURE_2D, mTex);
    mWebgl->TexStorage(LOCAL_GL_TEXTURE_2D, 1, kDXT5, {kTexSize, kTexSize, 1});
  }

  void TexSubImageFromBytes(GLenum aImageTarget, const uvec3& aOffset,
                            const uvec3& aSize) {
    const std::vector<uint8_t> bytes(
        size_t(aSize.x) * aSize.y * aSize.z * sizeof(uint32_t), 0x7f);

    webgl::TexUnpackBlobDesc sub = {aImageTarget, aSize};
    sub.cpuData = Some(Span<const uint8_t>(bytes));
    sub.unpacking.alignmentInTypeElems = 1;
    sub.unpacking.rowLength = aSize.x;
    sub.unpacking.imageHeight = aSize.y;
    mWebgl->TexImage(0, 0, aOffset, kPI, sub);
  }

  void TexSubImageFromUnmappableSurface(GLenum aImageTarget,
                                        const uvec3& aOffset, uint32_t aSize) {
    webgl::TexUnpackBlobDesc sub = {aImageTarget, {aSize, aSize, 1}};
    sub.sourceSurf = new UnmappableSourceSurface(aSize);
    sub.structuredSrcSize = Some(uvec2{aSize, aSize});
    sub.unpacking.alignmentInTypeElems = 1;
    sub.unpacking.rowLength = aSize;
    sub.unpacking.imageHeight = aSize;
    mWebgl->TexImage(0, 0, aOffset, kPI, sub);
  }

  void CompressedSubImageFromBytes(const uvec3& aOffset, const uvec3& aSize) {
    const std::vector<uint8_t> bytes(DXT5ByteCount(aSize), 0x7f);
    mWebgl->CompressedTexImage(
        true, LOCAL_GL_TEXTURE_2D, 0, kDXT5, aOffset, aSize,
        Range<const uint8_t>(bytes.data(), bytes.size()), 0, Nothing());
  }
};

TEST_F(WebGLTextureUploadInit, FullUploadFailLeavesSliceMarkedUninitialized) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ASSERT_TRUE((*imageInfo.mUninitializedSlices)[0]);
  ExpectNoError("Texture allocation should not error.");

  TexSubImageFromUnmappableSurface(LOCAL_GL_TEXTURE_2D, {0, 0, 0}, kTexSize);

  ExpectError(LOCAL_GL_OUT_OF_MEMORY,
              "Upload should have failed while mapping the source surface, "
              "rather than during validation.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "Failing to map the source surface should not truncate the level.";
  ASSERT_TRUE(imageInfo.mUninitializedSlices)
  << "Full texture upload failure should prevent clearing uninitialized "
     "slices.";
  EXPECT_TRUE((*imageInfo.mUninitializedSlices)[0])
      << "Full texture upload failure should block marking slices as "
         "initialized.";
}

TEST_F(WebGLTextureUploadInit, FullUploadSuccessClearsSlice) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ExpectNoError("Texture allocation should not error.");

  TexSubImageFromBytes(LOCAL_GL_TEXTURE_2D, {0, 0, 0}, {kTexSize, kTexSize, 1});

  ExpectNoError("Full texture upload should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful upload should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "Slices should be cleared after a successful full texture upload.";
}

TEST_F(WebGLTextureUploadInit, PartialUploadSuccessMarkedInitialized) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ExpectNoError("Texture allocation should not error.");

  TexSubImageFromBytes(LOCAL_GL_TEXTURE_2D, {0, 0, 0}, {kSubSize, kSubSize, 1});

  ExpectNoError("Partial texture upload should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful upload should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "Texture is zeroed before partial upload, no uninitialized slices "
         "should remain.";
}

TEST_F(WebGLTextureUploadInit, PartialUploadFailureMarkedInitialized) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ExpectNoError("Texture allocation should not error.");

  TexSubImageFromUnmappableSurface(LOCAL_GL_TEXTURE_2D, {0, 0, 0}, kSubSize);

  ExpectError(LOCAL_GL_OUT_OF_MEMORY,
              "Upload should have failed while mapping the source surface, "
              "rather than during validation.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "Failing to map the source surface should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "Texture is zeroed before partial upload, no uninitialized slices "
         "should remain.";
}

TEST_F(WebGLTextureUploadInit, NonUploadSliceNotMarkedInitialized) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D_ARRAY, 2);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D_ARRAY, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ASSERT_TRUE((*imageInfo.mUninitializedSlices)[0]);
  ASSERT_TRUE((*imageInfo.mUninitializedSlices)[1]);
  ExpectNoError("Texture allocation should not error.");

  TexSubImageFromBytes(LOCAL_GL_TEXTURE_2D_ARRAY, {0, 0, 0},
                       {kTexSize, kTexSize, 1});

  ExpectNoError("Single slice upload should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful upload should not truncate the level.";
  ASSERT_TRUE(imageInfo.mUninitializedSlices)
  << "Uploading a subset of texture slices should not clear all uninitialized "
     "slices.";
  EXPECT_FALSE((*imageInfo.mUninitializedSlices)[0])
      << "Slice should be marked as initialized when it was part of the "
         "texture upload.";
  EXPECT_TRUE((*imageInfo.mUninitializedSlices)[1])
      << "Slice should not be marked as initialized when it was not part of "
         "the texture upload.";
}

TEST_F(WebGLTextureUploadInit, CopyTexSubImageClearsSlice) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ExpectNoError("Texture allocation should not error.");

  mWebgl->CopyTexImage(LOCAL_GL_TEXTURE_2D, 0, 0, {0, 0, 0}, {0, 0},
                       {kTexSize, kTexSize});

  ExpectNoError("Full image copyTexSubImage should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful copy should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "Slices should be cleared after a successful copyTexSubImage over the "
         "full image.";
}

TEST_F(WebGLTextureUploadInit, CopyTexSubImagePartialOverlapZeroesFullImage) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ExpectNoError("Texture allocation should not error.");

  mWebgl->CopyTexImage(LOCAL_GL_TEXTURE_2D, 0, 0, {0, 0, 0},
                       {kSubSize, kSubSize}, {kTexSize, kTexSize});

  ExpectNoError("Partially overlapping copyTexSubImage should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful copy should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "The image is zeroed before a copy which cannot fully overwrite it, "
         "no uninitialized slices should remain.";
}

TEST_F(WebGLTextureUploadInit, CopyTexSubImagePartialRegionMarksInitialized) {
  BindAndAllocUninitialized(LOCAL_GL_TEXTURE_2D);

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ExpectNoError("Texture allocation should not error.");

  mWebgl->CopyTexImage(LOCAL_GL_TEXTURE_2D, 0, 0, {0, 0, 0}, {0, 0},
                       {kSubSize, kSubSize});

  ExpectNoError("Partial region copyTexSubImage should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful copy should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "Texture is zeroed before a partial copy, no uninitialized slices "
         "should remain.";
}

TEST_F(WebGLTextureUploadInit, CompressedFullUploadSuccessClearsSlice) {
  if (!EnableS3TC()) {
    GTEST_SKIP() << "No S3TC support in this environment.";
  }
  BindAndAllocUninitializedCompressed();

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ASSERT_TRUE((*imageInfo.mUninitializedSlices)[0]);
  ExpectNoError("Compressed texture allocation should not error.");

  CompressedSubImageFromBytes({0, 0, 0}, {kTexSize, kTexSize, 1});

  ExpectNoError("Full compressed texture upload should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful upload should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "Slices should be cleared after a successful full compressed texture "
         "upload.";
}

TEST_F(WebGLTextureUploadInit, CompressedPartialUploadMarksInitialized) {
  if (!EnableS3TC()) {
    GTEST_SKIP() << "No S3TC support in this environment.";
  }
  BindAndAllocUninitializedCompressed();

  const auto& imageInfo = mTex->ImageInfoAt(LOCAL_GL_TEXTURE_2D, 0);
  ASSERT_TRUE(imageInfo.IsDefined());
  ASSERT_TRUE(imageInfo.mUninitializedSlices);
  ExpectNoError("Compressed texture allocation should not error.");

  CompressedSubImageFromBytes({kDXT5BlockSize, kDXT5BlockSize, 0},
                              {kSubSize, kSubSize, 1});

  ExpectNoError("Partial compressed texture upload should succeed.");
  ASSERT_TRUE(imageInfo.IsDefined())
  << "A successful upload should not truncate the level.";
  EXPECT_FALSE(imageInfo.mUninitializedSlices)
      << "Texture is zeroed before partial upload, no uninitialized slices "
         "should remain.";
}

}  // namespace mozilla
