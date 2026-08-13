/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Hal.h"
#include "mozilla/java/GeckoSensorWrappers.h"

using namespace mozilla::hal;

namespace mozilla::hal_impl {

void EnableSensorNotifications(SensorType aSensor) {
  java::GeckoSensor::EnableSensor(aSensor);
}

void DisableSensorNotifications(SensorType aSensor) {
  java::GeckoSensor::DisableSensor(aSensor);
}

}  // namespace mozilla::hal_impl
