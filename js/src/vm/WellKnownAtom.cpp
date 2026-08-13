/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "vm/WellKnownAtom.h"

// NOTE: This needs to use the wide version of HashString to match AtomTableKey.
constinit js::WellKnownAtomInfo js::wellKnownAtomInfos[] = {
#define ENUM_ENTRY_(_, TEXT) \
  {uint32_t(sizeof(TEXT) - 1), mozilla::HashString(u"" TEXT), TEXT},
    FOR_EACH_COMMON_PROPERTYNAME(ENUM_ENTRY_)
#undef ENUM_ENTRY_

#define ENUM_ENTRY_(NAME, _) \
  {uint32_t(sizeof(#NAME) - 1), mozilla::HashString(u"" #NAME), #NAME},
        JS_FOR_EACH_PROTOTYPE(ENUM_ENTRY_)
#undef ENUM_ENTRY_

#define ENUM_ENTRY_(NAME) \
  {uint32_t(sizeof(#NAME) - 1), mozilla::HashString(u"" #NAME), #NAME},
            JS_FOR_EACH_WELL_KNOWN_SYMBOL(ENUM_ENTRY_)
#undef ENUM_ENTRY_
};
