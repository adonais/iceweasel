/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "IPCMessageUtilsSpecializations.h"
#include "nsGkAtoms.h"

namespace IPC {

static const uint16_t kDynamicAtomToken = 0xffff;

static_assert(kDynamicAtomToken >= nsGkAtoms::kStaticAtomCount,
              "Exceeded supported number of static atoms");

/* static */
void ParamTraits<nsAtom*>::Write(MessageWriter* aWriter, const nsAtom* aParam) {
  MOZ_ASSERT(aParam);

  if (aParam->IsStatic()) {
    const nsStaticAtom* atom = aParam->AsStatic();
    uint16_t index = static_cast<uint16_t>(nsGkAtoms::IndexOf(atom));
    MOZ_ASSERT(index < nsGkAtoms::kStaticAtomCount);
    WriteParam(aWriter, index);
    return;
  }
  WriteParam(aWriter, kDynamicAtomToken);
  nsDependentAtomString atomStr(aParam);
  // nsDependentAtomString is serialized as its base, nsString, but we
  // can be explicit about it.
  nsString& str = atomStr;
  WriteParam(aWriter, str);
}

/* static */
bool ParamTraits<nsAtom*>::Read(MessageReader* aReader,
                                RefPtr<nsAtom>* aResult) {
  uint16_t token;
  if (!ReadParam(aReader, &token)) {
    return false;
  }
  if (token != kDynamicAtomToken) {
    if (token >= nsGkAtoms::kStaticAtomCount) {
      return false;
    }
    *aResult = nsGkAtoms::GetAtomByIndex(token);
    return true;
  }

  nsAutoString str;
  if (!ReadParam(aReader, static_cast<nsString*>(&str))) {
    return false;
  }

  *aResult = NS_Atomize(str);
  MOZ_ASSERT(*aResult);
  return true;
}

}  // namespace IPC
