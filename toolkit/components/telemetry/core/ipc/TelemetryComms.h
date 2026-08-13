/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef Telemetry_Comms_h_
#define Telemetry_Comms_h_

#include <type_traits>
#include "ipc/IPCMessageUtils.h"
#include "ipc/IPCMessageUtilsSpecializations.h"
#include "mozilla/Attributes.h"
#include "mozilla/Telemetry.h"
#include "mozilla/TelemetryProcessEnums.h"
#include "mozilla/TelemetryHistogramEnums.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/Variant.h"
#include "nsITelemetry.h"

namespace mozilla {
namespace Telemetry {

struct HistogramAccumulation {
  mozilla::Telemetry::HistogramID mId;
  uint32_t mSample;
};

struct KeyedHistogramAccumulation {
  mozilla::Telemetry::HistogramID mId;
  uint32_t mSample;
  nsCString mKey;
};

// Scalar accumulation types.
enum class ScalarID : uint32_t;

enum class ScalarActionType : uint32_t { eSet = 0, eAdd = 1, eSetMaximum = 2 };

typedef mozilla::Variant<uint32_t, bool, nsString> ScalarVariant;

struct ScalarAction {
  uint32_t mId;
  bool mDynamic;
  ScalarActionType mActionType;
  // We need to wrap mData in a Maybe otherwise the IPC system
  // is unable to instantiate a ScalarAction.
  Maybe<ScalarVariant> mData;
  // The process type this scalar should be recorded for.
  // The IPC system will determine the process this action was coming from
  // later.
  mozilla::Telemetry::ProcessID mProcessType;
};

struct KeyedScalarAction : public ScalarAction {
  nsCString mKey;
};

// Dynamic scalars support.
struct DynamicScalarDefinition {
  uint32_t type;
  uint32_t dataset;
  bool expired;
  bool keyed;
  nsCString name;

  bool operator==(const DynamicScalarDefinition& rhs) const {
    return type == rhs.type && dataset == rhs.dataset &&
           expired == rhs.expired && keyed == rhs.keyed &&
           name.Equals(rhs.name);
  }
};

struct ChildEventData {
  mozilla::TimeStamp timestamp;
  nsCString category;
  nsCString method;
  nsCString object;
  mozilla::Maybe<nsCString> value;
  CopyableTArray<EventExtraEntry> extra;
};

struct DiscardedData {
  uint32_t mDiscardedHistogramAccumulations;
  uint32_t mDiscardedKeyedHistogramAccumulations;
  uint32_t mDiscardedScalarActions;
  uint32_t mDiscardedKeyedScalarActions;
  uint32_t mDiscardedChildEvents;

  auto MutTiedFields() {
    return std::tie(mDiscardedHistogramAccumulations,
                    mDiscardedKeyedHistogramAccumulations,
                    mDiscardedScalarActions, mDiscardedKeyedScalarActions,
                    mDiscardedChildEvents);
  }
};

}  // namespace Telemetry
}  // namespace mozilla

namespace IPC {

template <>
struct ParamTraits<mozilla::Telemetry::HistogramID>
    : public ContiguousEnumSerializer<
          mozilla::Telemetry::HistogramID,
          mozilla::Telemetry::HistogramID::A11Y_CONSUMERS,
          mozilla::Telemetry::HistogramID::HistogramCount> {};

static_assert(
    static_cast<std::underlying_type_t<mozilla::Telemetry::HistogramID>>(
        mozilla::Telemetry::HistogramID::A11Y_CONSUMERS) == 0,
    "Update ParamTraits<HistogramID> implementation");

template <>
struct MOZ_ENUM_SERIALIZER_ALLOW_SENTINEL_UPPER_BOUND
    ParamTraits<mozilla::Telemetry::ScalarActionType>
    : public ContiguousEnumSerializerInclusive<
          mozilla::Telemetry::ScalarActionType,
          mozilla::Telemetry::ScalarActionType::eSet,
          mozilla::Telemetry::ScalarActionType::eSetMaximum> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::Telemetry::HistogramAccumulation,
                                  mId, mSample);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(
    mozilla::Telemetry::KeyedHistogramAccumulation, mId, mSample, mKey);

/**
 * IPC scalar data message serialization and de-serialization.
 */
template <>
struct ParamTraits<mozilla::Telemetry::ScalarAction> {
  typedef mozilla::Telemetry::ScalarAction paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam) {
    // Write the message type
    WriteParam(aWriter, aParam.mId);
    WriteParam(aWriter, aParam.mDynamic);
    WriteParam(aWriter, aParam.mActionType);

    if (aParam.mData.isNothing()) {
      MOZ_CRASH("There is no data in the ScalarAction.");
      return;
    }

    if (aParam.mData->is<uint32_t>()) {
      // That's a nsITelemetry::SCALAR_TYPE_COUNT.
      WriteParam(aWriter,
                 static_cast<uint32_t>(nsITelemetry::SCALAR_TYPE_COUNT));
      WriteParam(aWriter, aParam.mData->as<uint32_t>());
    } else if (aParam.mData->is<nsString>()) {
      // That's a nsITelemetry::SCALAR_TYPE_STRING.
      WriteParam(aWriter,
                 static_cast<uint32_t>(nsITelemetry::SCALAR_TYPE_STRING));
      WriteParam(aWriter, aParam.mData->as<nsString>());
    } else if (aParam.mData->is<bool>()) {
      // That's a nsITelemetry::SCALAR_TYPE_BOOLEAN.
      WriteParam(aWriter,
                 static_cast<uint32_t>(nsITelemetry::SCALAR_TYPE_BOOLEAN));
      WriteParam(aWriter, aParam.mData->as<bool>());
    } else {
      MOZ_CRASH("Unknown scalar type.");
    }
  }

  static bool Read(MessageReader* aReader, paramType* aResult) {
    // Read the scalar ID and the scalar type.
    uint32_t scalarType = 0;
    if (!ReadParam(aReader, &aResult->mId) ||
        !ReadParam(aReader, &aResult->mDynamic) ||
        !ReadParam(aReader, &aResult->mActionType) ||
        !ReadParam(aReader, &scalarType)) {
      return false;
    }

    // De-serialize the data based on the scalar type.
    switch (scalarType) {
      case nsITelemetry::SCALAR_TYPE_COUNT: {
        uint32_t data = 0;
        // De-serialize the data.
        if (!ReadParam(aReader, &data)) {
          return false;
        }
        aResult->mData = mozilla::Some(mozilla::AsVariant(data));
        break;
      }
      case nsITelemetry::SCALAR_TYPE_STRING: {
        nsString data;
        // De-serialize the data.
        if (!ReadParam(aReader, &data)) {
          return false;
        }
        aResult->mData = mozilla::Some(mozilla::AsVariant(data));
        break;
      }
      case nsITelemetry::SCALAR_TYPE_BOOLEAN: {
        bool data = false;
        // De-serialize the data.
        if (!ReadParam(aReader, &data)) {
          return false;
        }
        aResult->mData = mozilla::Some(mozilla::AsVariant(data));
        break;
      }
      default:
        MOZ_ASSERT(false, "Unknown scalar type.");
        return false;
    }

    return true;
  }
};

/**
 * IPC keyed scalar data message serialization and de-serialization.
 */
template <>
struct ParamTraits<mozilla::Telemetry::KeyedScalarAction> {
  typedef mozilla::Telemetry::KeyedScalarAction paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam) {
    // Write the message type
    WriteParam(aWriter, aParam.mId);
    WriteParam(aWriter, aParam.mDynamic);
    WriteParam(aWriter, aParam.mActionType);
    WriteParam(aWriter, aParam.mKey);

    if (aParam.mData.isNothing()) {
      MOZ_CRASH("There is no data in the KeyedScalarAction.");
      return;
    }

    if (aParam.mData->is<uint32_t>()) {
      // That's a nsITelemetry::SCALAR_TYPE_COUNT.
      WriteParam(aWriter,
                 static_cast<uint32_t>(nsITelemetry::SCALAR_TYPE_COUNT));
      WriteParam(aWriter, aParam.mData->as<uint32_t>());
    } else if (aParam.mData->is<nsString>()) {
      // That's a nsITelemetry::SCALAR_TYPE_STRING.
      // Keyed string scalars are not supported.
      MOZ_ASSERT(false,
                 "Keyed String Scalar unable to be write from child process. "
                 "Not supported.");
    } else if (aParam.mData->is<bool>()) {
      // That's a nsITelemetry::SCALAR_TYPE_BOOLEAN.
      WriteParam(aWriter,
                 static_cast<uint32_t>(nsITelemetry::SCALAR_TYPE_BOOLEAN));
      WriteParam(aWriter, aParam.mData->as<bool>());
    } else {
      MOZ_CRASH("Unknown keyed scalar type.");
    }
  }

  static bool Read(MessageReader* aReader, paramType* aResult) {
    // Read the scalar ID and the scalar type.
    uint32_t scalarType = 0;
    if (!ReadParam(aReader, &aResult->mId) ||
        !ReadParam(aReader, &aResult->mDynamic) ||
        !ReadParam(aReader, &aResult->mActionType) ||
        !ReadParam(aReader, &aResult->mKey) ||
        !ReadParam(aReader, &scalarType)) {
      return false;
    }

    // De-serialize the data based on the scalar type.
    switch (scalarType) {
      case nsITelemetry::SCALAR_TYPE_COUNT: {
        uint32_t data = 0;
        // De-serialize the data.
        if (!ReadParam(aReader, &data)) {
          return false;
        }
        aResult->mData = mozilla::Some(mozilla::AsVariant(data));
        break;
      }
      case nsITelemetry::SCALAR_TYPE_STRING: {
        // Keyed string scalars are not supported.
        MOZ_ASSERT(false,
                   "Keyed String Scalar unable to be read from child process. "
                   "Not supported.");
        return false;
      }
      case nsITelemetry::SCALAR_TYPE_BOOLEAN: {
        bool data = false;
        // De-serialize the data.
        if (!ReadParam(aReader, &data)) {
          return false;
        }
        aResult->mData = mozilla::Some(mozilla::AsVariant(data));
        break;
      }
      default:
        MOZ_ASSERT(false, "Unknown keyed scalar type.");
        return false;
    }

    return true;
  }
};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::Telemetry::DynamicScalarDefinition,
                                  type, dataset, expired, keyed, name);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::Telemetry::ChildEventData, timestamp,
                                  category, method, object, value, extra);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::Telemetry::EventExtraEntry, key,
                                  value);

template <>
struct ParamTraits<mozilla::Telemetry::DiscardedData>
    : public ParamTraits_TiedFields<mozilla::Telemetry::DiscardedData> {};

}  // namespace IPC

#endif  // Telemetry_Comms_h_
