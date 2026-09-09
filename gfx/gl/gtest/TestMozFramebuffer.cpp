/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GLContext.h"
#include "GLContextProvider.h"
#include "MozFramebuffer.h"
#include "ScopedGLHelpers.h"
#include "gfxPlatform.h"
#include "gtest/gtest.h"

namespace mozilla::gl {

static already_AddRefed<GLContext> CreateTestContext(
    nsACString* const aFailureId) {
  return GLContextProvider::CreateHeadless({}, aFailureId);
}

TEST(MozFramebuffer, OwnedColorBackingIsDeletedWithFramebuffer)
{
  gfxPlatform::GetPlatform();

  nsCString failureId;
  RefPtr<GLContext> gl = CreateTestContext(&failureId);
  ASSERT_TRUE(gl)
  << failureId.get();
  ASSERT_TRUE(gl->MakeCurrent());

  const gfx::IntSize size(16, 16);
  GLuint texture = gl->CreateTexture();
  {
    const ScopedBindTexture bindTexture(gl, texture);
    gl->TexParams_SetClampNoMips(LOCAL_GL_TEXTURE_2D);
    gl->fTexImage2D(LOCAL_GL_TEXTURE_2D, 0, LOCAL_GL_RGBA, size.width,
                    size.height, 0, LOCAL_GL_RGBA, LOCAL_GL_UNSIGNED_BYTE,
                    nullptr);
  }
  ASSERT_TRUE(gl->fIsTexture(texture));

  {
    auto framebuffer = MozFramebuffer::CreateForBacking(
        gl, size, 0, false, false, LOCAL_GL_TEXTURE_2D, texture);
    ASSERT_TRUE(framebuffer);
  }

  EXPECT_FALSE(gl->fIsTexture(texture));
}

TEST(MozFramebuffer, BorrowedColorBackingSurvivesFramebufferDestruction)
{
  gfxPlatform::GetPlatform();

  nsCString failureId;
  RefPtr<GLContext> gl = CreateTestContext(&failureId);
  ASSERT_TRUE(gl)
  << failureId.get();
  ASSERT_TRUE(gl->MakeCurrent());

  const gfx::IntSize size(16, 16);
  GLuint texture = gl->CreateTexture();
  {
    const ScopedBindTexture bindTexture(gl, texture);
    gl->TexParams_SetClampNoMips(LOCAL_GL_TEXTURE_2D);
    gl->fTexImage2D(LOCAL_GL_TEXTURE_2D, 0, LOCAL_GL_RGBA, size.width,
                    size.height, 0, LOCAL_GL_RGBA, LOCAL_GL_UNSIGNED_BYTE,
                    nullptr);
  }
  ASSERT_TRUE(gl->fIsTexture(texture));

  {
    auto framebuffer = MozFramebuffer::CreateForBacking(
        gl, size, 0, false, false, LOCAL_GL_TEXTURE_2D, texture,
        MozFramebuffer::ColorBackingOwnership::Borrowed);
    ASSERT_TRUE(framebuffer);
    EXPECT_EQ(framebuffer->ColorTex(), texture);
  }

  EXPECT_TRUE(gl->fIsTexture(texture));
  gl->DeleteTexture(texture);
}

}  // namespace mozilla::gl
