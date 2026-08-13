/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AndroidSurfaceTexture.h"

#include <cstring>

namespace mozilla {
namespace gl {

#ifdef MOZ_WIDGET_ANDROID

void AndroidSurfaceTexture::GetTransformMatrix(
    const java::sdk::SurfaceTexture::Ref& surfaceTexture,
    gfx::Matrix4x4* outMatrix) {
  JNIEnv* const env = jni::GetEnvForThread();

  auto jarray = jni::FloatArray::LocalRef::Adopt(env, env->NewFloatArray(16));
  surfaceTexture->GetTransformMatrix(jarray);

  jfloat* array = env->GetFloatArrayElements(jarray.Get(), nullptr);

  memcpy(&(outMatrix->_11), array, sizeof(float) * 16);

  env->ReleaseFloatArrayElements(jarray.Get(), array, 0);
}

#endif  // MOZ_WIDGET_ANDROID

}  // namespace gl
}  // namespace mozilla
