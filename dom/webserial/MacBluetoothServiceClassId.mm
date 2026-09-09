/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MacBluetoothServiceClassId.h"

#import <IOBluetooth/IOBluetooth.h>

#include "MacAutoreleasePool.h"
#include "Serial.h"
#include "SerialLogging.h"
#include "mozilla/ScopeExit.h"

namespace mozilla::dom {

// Returns the RFCOMM channel for the given registry entry, searching parents
// in the IOService plane. The IOBluetoothSerialClient driver publishes
// "RFCOMMChannel" as a kCFNumberSInt32Type (or compatible) value on the
// service entry.
static Maybe<uint8_t> ReadRFCOMMChannel(io_service_t aDevice) {
  CFTypeRef ref = IORegistryEntrySearchCFProperty(
      aDevice, kIOServicePlane, CFSTR("RFCOMMChannel"), kCFAllocatorDefault,
      kIORegistryIterateRecursively | kIORegistryIterateParents);
  if (!ref) {
    return Nothing();
  }
  auto cleanup = MakeScopeExit([&]() { CFRelease(ref); });
  if (CFGetTypeID(ref) != CFNumberGetTypeID()) {
    return Nothing();
  }
  int32_t value = 0;
  if (!CFNumberGetValue((CFNumberRef)ref, kCFNumberSInt32Type, &value)) {
    return Nothing();
  }
  if (value <= 0 || value > 30) {
    // Valid RFCOMM channels are 1-30 per the spec.
    return Nothing();
  }
  return Some(static_cast<uint8_t>(value));
}

// Reads the BluetoothDeviceAddress (6 bytes, big-endian) from the registry
// entry, searching parents. The IOBluetoothDevice ancestor publishes this
// as kCFDataType.
static NSString* ReadBluetoothAddressString(io_service_t aDevice) {
  CFTypeRef ref = IORegistryEntrySearchCFProperty(
      aDevice, kIOServicePlane, CFSTR("BluetoothDeviceAddress"),
      kCFAllocatorDefault,
      kIORegistryIterateRecursively | kIORegistryIterateParents);
  if (!ref) {
    return nil;
  }
  auto cleanup = MakeScopeExit([&]() { CFRelease(ref); });
  if (CFGetTypeID(ref) != CFDataGetTypeID()) {
    return nil;
  }
  CFDataRef data = (CFDataRef)ref;
  if (CFDataGetLength(data) != 6) {
    return nil;
  }
  const UInt8* bytes = CFDataGetBytePtr(data);
  // +[IOBluetoothDevice deviceWithAddressString:] accepts ':' or '-' separated
  // forms, as well as a bare 12-character hex string. Use ':' to match Apple's
  // own canonical form.
  return [NSString stringWithFormat:@"%02X:%02X:%02X:%02X:%02X:%02X", bytes[0],
                                    bytes[1], bytes[2], bytes[3], bytes[4],
                                    bytes[5]];
}

// Converts an IOBluetoothSDPUUID (always 16 bytes after expansion) to the
// canonical lowercase hex string used by WebSerial. Returns an empty string
// on failure.
static nsString CanonicalUUIDFromSDPUUID(IOBluetoothSDPUUID* aSdpUuid) {
  IOBluetoothSDPUUID* full = [aSdpUuid getUUIDWithLength:16];
  NSData* data = full;
  if (!data || data.length != 16) {
    return nsString();
  }
  const uint8_t* bytes = static_cast<const uint8_t*>(data.bytes);
  nsString result;
  result.AppendPrintf(
      "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
      bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6],
      bytes[7], bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13],
      bytes[14], bytes[15]);
  return result;
}

// Walks the ServiceClassIDList attribute of an SDP service record and returns
// the first UUID found.
static nsString ExtractServiceClassUUID(
    IOBluetoothSDPServiceRecord* aServiceRecord) {
  IOBluetoothSDPDataElement* serviceClassData =
      [aServiceRecord getAttributeDataElement:
                          kBluetoothSDPAttributeIdentifierServiceClassIDList];
  if (!serviceClassData) {
    return nsString();
  }

  BluetoothSDPDataElementTypeDescriptor typeDescriptor =
      [serviceClassData getTypeDescriptor];
  if (typeDescriptor == kBluetoothSDPDataElementTypeUUID) {
    return CanonicalUUIDFromSDPUUID([serviceClassData getUUIDValue]);
  }
  if (typeDescriptor == kBluetoothSDPDataElementTypeDataElementSequence) {
    for (IOBluetoothSDPDataElement* inner in [serviceClassData getArrayValue]) {
      if ([inner getTypeDescriptor] == kBluetoothSDPDataElementTypeUUID) {
        return CanonicalUUIDFromSDPUUID([inner getUUIDValue]);
      }
    }
  }
  return nsString();
}

Maybe<nsString> LookupMacBluetoothServiceClassId(io_service_t aDevice) {
  // This may be called from a background thread that has no autorelease pool
  // of its own. The Cocoa calls below (-[NSString stringWithFormat:],
  // +[IOBluetoothDevice deviceWithAddressString:], -[IOBluetoothDevice
  // services], -[IOBluetoothSDPDataElement getArrayValue], ...) all return
  // autoreleased objects, so install a pool for the duration of the lookup
  // so they don't leak.
  mozilla::MacAutoreleasePool pool;

  Maybe<uint8_t> channel = ReadRFCOMMChannel(aDevice);
  if (channel.isNothing()) {
    MOZ_LOG(gWebSerialLog, LogLevel::Debug,
            ("LookupMacBluetoothServiceClassId: no RFCOMMChannel property"));
    return Nothing();
  }

  NSString* addressString = ReadBluetoothAddressString(aDevice);
  if (!addressString) {
    MOZ_LOG(gWebSerialLog, LogLevel::Debug,
            ("LookupMacBluetoothServiceClassId: no BluetoothDeviceAddress "
             "property"));
    return Nothing();
  }

  IOBluetoothDevice* device =
      [IOBluetoothDevice deviceWithAddressString:addressString];
  if (!device) {
    MOZ_LOG(gWebSerialLog, LogLevel::Debug,
            ("LookupMacBluetoothServiceClassId: deviceWithAddressString "
             "returned nil"));
    return Nothing();
  }

  for (IOBluetoothSDPServiceRecord* record in [device services]) {
    BluetoothRFCOMMChannelID rfcommChannel = 0;
    if ([record getRFCOMMChannelID:&rfcommChannel] != kIOReturnSuccess) {
      continue;
    }
    if (rfcommChannel != channel.value()) {
      continue;
    }
    nsString uuid = ExtractServiceClassUUID(record);
    if (Serial::IsValidBluetoothUUID(uuid)) {
      MOZ_LOG(gWebSerialLog, LogLevel::Debug,
              ("LookupMacBluetoothServiceClassId: matched channel %u to UUID "
               "%s",
               channel.value(), NS_ConvertUTF16toUTF8(uuid).get()));
      return Some(uuid);
    }
  }

  MOZ_LOG(gWebSerialLog, LogLevel::Debug,
          ("LookupMacBluetoothServiceClassId: no SDP record matched channel %u",
           channel.value()));
  return Nothing();
}

}  // namespace mozilla::dom
