/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_psm_PSMIPCUtils_h_
#define mozilla_psm_PSMIPCUtils_h_

#include "ipc/EnumSerializer.h"

namespace mozilla::psm {

enum class SearchingFor : uint8_t {
  ClientCertificates = 1,
  CACertificates = 2,
};

}  // namespace mozilla::psm

namespace IPC {

template <>
struct ParamTraits<mozilla::psm::SearchingFor>
    : ContiguousEnumSerializerInclusive<
          mozilla::psm::SearchingFor,
          mozilla::psm::SearchingFor::ClientCertificates,
          mozilla::psm::SearchingFor::CACertificates> {};

}  // namespace IPC

#endif  // mozilla_psm_PSMIPCUtils_h_
