/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SessionStoreMessageUtils_h
#define mozilla_dom_SessionStoreMessageUtils_h

#include "ipc/IPCMessageUtils.h"
#include "mozilla/ipc/URIUtils.h"
#include "SessionStoreData.h"
#include "SessionStoreUtils.h"
#include "SessionStoreRestoreData.h"

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::CollectedNonMultipleSelectValue,
                                  mSelectedIndex, mValue);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(CollectedInputDataValue, id, type, value);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(InputFormData, descendants, innerHTML, url,
                                  numId, numXPath);

template <>
struct ParamTraits<mozilla::dom::SessionStoreRestoreData*> {
  // Note that we intentionally don't de/serialize mChildren here. The receiver
  // won't be doing anything with the children lists, and it avoids sending form
  // data for subframes to the content processes of their embedders.

  static void Write(IPC::MessageWriter* aWriter,
                    mozilla::dom::SessionStoreRestoreData* aParam) {
    bool isNull = !aParam;
    WriteParam(aWriter, isNull);
    if (isNull) {
      return;
    }
    WriteParam(aWriter, aParam->mURI);
    WriteParam(aWriter, aParam->mInnerHTML);
    WriteParam(aWriter, aParam->mScroll);
    WriteParam(aWriter, aParam->mEntries);
  }

  static bool Read(IPC::MessageReader* aReader,
                   RefPtr<mozilla::dom::SessionStoreRestoreData>* aResult) {
    *aResult = nullptr;
    bool isNull;
    if (!ReadParam(aReader, &isNull)) {
      return false;
    }
    if (isNull) {
      return true;
    }
    auto data = mozilla::MakeRefPtr<mozilla::dom::SessionStoreRestoreData>();
    if (!ReadParam(aReader, &data->mURI) ||
        !ReadParam(aReader, &data->mInnerHTML) ||
        !ReadParam(aReader, &data->mScroll) ||
        !ReadParam(aReader, &data->mEntries)) {
      return false;
    }
    *aResult = std::move(data);
    return true;
  }
};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::SessionStoreRestoreData::Entry,
                                  mData, mIsXPath);

}  // namespace IPC

#endif  // mozilla_dom_SessionStoreMessageUtils_h
