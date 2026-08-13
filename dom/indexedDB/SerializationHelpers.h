/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_indexeddb_serializationhelpers_h_
#define mozilla_dom_indexeddb_serializationhelpers_h_

#include "TransactionOpResult.h"
#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtilsSpecializations.h"
#include "mozilla/dom/BindingIPCUtils.h"
#include "mozilla/dom/IDBCursor.h"
#include "mozilla/dom/IDBTransaction.h"
#include "mozilla/dom/indexedDB/Key.h"
#include "mozilla/dom/indexedDB/KeyPath.h"

namespace IPC {

template <>
struct ParamTraits<mozilla::dom::indexedDB::StructuredCloneFileBase::FileType>
    : public ContiguousEnumSerializer<
          mozilla::dom::indexedDB::StructuredCloneFileBase::FileType,
          mozilla::dom::indexedDB::StructuredCloneFileBase::eBlob,
          mozilla::dom::indexedDB::StructuredCloneFileBase::eEndGuard> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::indexedDB::Key, mBuffer,
                                  mAutoIncrementKeyOffsets);

template <>
struct ParamTraits<mozilla::dom::indexedDB::KeyPath::KeyPathType>
    : public ContiguousEnumSerializer<
          mozilla::dom::indexedDB::KeyPath::KeyPathType,
          mozilla::dom::indexedDB::KeyPath::KeyPathType::NonExistent,
          mozilla::dom::indexedDB::KeyPath::KeyPathType::EndGuard> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::indexedDB::KeyPath, mType,
                                  mStrings);

template <>
struct ParamTraits<mozilla::dom::IDBCursor::Direction>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::IDBCursor::Direction> {};

template <>
struct ParamTraits<mozilla::dom::IDBTransaction::Mode>
    : public ContiguousEnumSerializer<
          mozilla::dom::IDBTransaction::Mode,
          mozilla::dom::IDBTransaction::Mode::ReadOnly,
          mozilla::dom::IDBTransaction::Mode::Invalid> {};

template <>
struct ParamTraits<mozilla::dom::IDBTransaction::Durability>
    : public ContiguousEnumSerializer<
          mozilla::dom::IDBTransaction::Durability,
          mozilla::dom::IDBTransaction::Durability::Default,
          mozilla::dom::IDBTransaction::Durability::Invalid> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::indexedDB::TransactionOpResult,
                                  mCode, mErrorMessage)

}  // namespace IPC

#endif  // mozilla_dom_indexeddb_serializationhelpers_h_
