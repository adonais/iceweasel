/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_RegistryMessageUtils_h
#define mozilla_RegistryMessageUtils_h

#include "ipc/IPCMessageUtilsSpecializations.h"
#include "nsString.h"

struct SerializedURI {
  nsCString spec;

  bool operator==(const SerializedURI& rhs) const {
    return spec.Equals(rhs.spec);
  }
};

struct ChromePackage {
  nsCString package;
  SerializedURI contentBaseURI;
  SerializedURI localeBaseURI;
  SerializedURI skinBaseURI;
  uint32_t flags;

  bool operator==(const ChromePackage& rhs) const {
    return package.Equals(rhs.package) &&
           contentBaseURI == rhs.contentBaseURI &&
           localeBaseURI == rhs.localeBaseURI &&
           skinBaseURI == rhs.skinBaseURI && flags == rhs.flags;
  }
};

struct SubstitutionMapping {
  nsCString scheme;
  nsCString path;
  SerializedURI resolvedURI;
  uint32_t flags;

  bool operator==(const SubstitutionMapping& rhs) const {
    return scheme.Equals(rhs.scheme) && path.Equals(rhs.path) &&
           resolvedURI == rhs.resolvedURI && flags == rhs.flags;
  }
};

struct OverrideMapping {
  SerializedURI originalURI;
  SerializedURI overrideURI;

  bool operator==(const OverrideMapping& rhs) const {
    return originalURI == rhs.originalURI && overrideURI == rhs.overrideURI;
  }
};

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(SerializedURI, spec);
DEFINE_IPC_SERIALIZER_WITH_FIELDS(ChromePackage, package, contentBaseURI,
                                  localeBaseURI, skinBaseURI, flags);
DEFINE_IPC_SERIALIZER_WITH_FIELDS(SubstitutionMapping, scheme, path,
                                  resolvedURI, flags);
DEFINE_IPC_SERIALIZER_WITH_FIELDS(OverrideMapping, originalURI, overrideURI);

}  // namespace IPC

#endif  // RegistryMessageUtils_h
