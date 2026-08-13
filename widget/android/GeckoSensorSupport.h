/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GeckoSensorSupport_h
#define GeckoSensorSupport_h

#include "mozilla/java/GeckoSensorNatives.h"
#include "mozilla/java/GeckoSensorWrappers.h"

using namespace mozilla;

namespace mozilla::widget {

class GeckoSensorSupport
    : public java::GeckoSensor::Natives<GeckoSensorSupport> {
 public:
  static void OnSensorChanged(int32_t aType, float aX, float aY, float aZ,
                              float aW, int64_t aTime);
};

}  // namespace mozilla::widget

#endif  // GeckoSensorSupport_h
