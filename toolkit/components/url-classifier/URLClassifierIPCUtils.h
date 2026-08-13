/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_urlclassiferipcutils_h
#define mozilla_urlclassiferipcutils_h

#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtils.h"
#include "nsIUrlClassifierFeature.h"
#include "nsIClassifiedChannel.h"

namespace IPC {

template <>
struct ParamTraits<nsIUrlClassifierFeature::listType>
    : public ContiguousEnumSerializerInclusive<
          nsIUrlClassifierFeature::listType,
          nsIUrlClassifierFeature::listType::blocklist,
          nsIUrlClassifierFeature::listType::entitylist> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::net::ClassificationFlags,
                                  firstPartyFlags, thirdPartyFlags);

}  // namespace IPC

#endif  // mozilla_urlclassiferipcutils_h
