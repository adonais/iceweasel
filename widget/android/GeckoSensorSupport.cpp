/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GeckoSensorSupport.h"

#include "mozilla/Hal.h"

using namespace mozilla;

namespace mozilla::widget {

// static
void GeckoSensorSupport::OnSensorChanged(int32_t aType, float aX, float aY,
                                         float aZ, float aW, int64_t aTime) {
  AutoTArray<float, 4> values;

  switch (aType) {
    // Bug 938035, transfer HAL data for orientation sensor to meet w3c
    // spec, ex: HAL report alpha=90 means East but alpha=90 means West
    // in w3c spec
    case hal::SENSOR_ORIENTATION:
      values.AppendElement(360.0f - aX);
      values.AppendElement(-aY);
      values.AppendElement(-aZ);
      break;

    case hal::SENSOR_LINEAR_ACCELERATION:
    case hal::SENSOR_ACCELERATION:
    case hal::SENSOR_GYROSCOPE:
      values.AppendElement(aX);
      values.AppendElement(aY);
      values.AppendElement(aZ);
      break;

    case hal::SENSOR_LIGHT:
      values.AppendElement(aX);
      break;

    case hal::SENSOR_ROTATION_VECTOR:
    case hal::SENSOR_GAME_ROTATION_VECTOR:
      values.AppendElement(aX);
      values.AppendElement(aY);
      values.AppendElement(aZ);
      values.AppendElement(aW);
      break;

    default:
      __android_log_print(ANDROID_LOG_ERROR, "Gecko", "Unknown sensor type %d",
                          aType);
  }

  hal::SensorData sdata(hal::SensorType(aType), aTime, values);
  hal::NotifySensorChange(sdata);
}

}  // namespace mozilla::widget
