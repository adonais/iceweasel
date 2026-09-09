/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MacBluetoothServiceClassId_h
#define mozilla_dom_MacBluetoothServiceClassId_h

#include <IOKit/IOKitLib.h>

#include "mozilla/Maybe.h"
#include "nsString.h"

namespace mozilla::dom {

// Attempts to resolve the actual Bluetooth service class UUID advertised by
// the SDP record backing a Bluetooth serial port. Returns Nothing if any
// step fails (missing registry properties, no matching service record,
// IOBluetooth framework calls fail, etc.); in that case the caller should
// fall back to the SPP UUID.
//
// aDevice must be the io_service_t passed to ExtractDeviceInfo (i.e. the
// IOSerialBSDClient or its provider chain that contains an
// IOBluetoothSerialClient).
Maybe<nsString> LookupMacBluetoothServiceClassId(io_service_t aDevice);

}  // namespace mozilla::dom

#endif  // mozilla_dom_MacBluetoothServiceClassId_h
