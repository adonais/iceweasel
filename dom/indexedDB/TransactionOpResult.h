/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_INDEXEDDB_TRANSACTION_OP_RESULT_H_
#define DOM_INDEXEDDB_TRANSACTION_OP_RESULT_H_

#include "nsError.h"
#include "nsString.h"

namespace IPC {

template <typename>
struct ParamTraits;

}  // namespace IPC

namespace mozilla::dom::indexedDB {

// Struct to carry over nsresult and potential error message from the parent
// process to the child process. As an early async Web API, IndexedDB is unique
// in directly exposing DOMException instances rather than throwing them or
// rejecting them on promises. Because ErrorResult infrastructure is strongly
// biased towards throwing/rejecting and does not provide a way to re-extract a
// DOMException and it was felt introducing one might create a footgun, we've
// introduced TransactionOpResult as a simple means to transport the result code
// and messages for the DOMExceptions IndexedDB emits.
struct TransactionOpResult {
  nsresult mCode;
  nsCString mErrorMessage;

  // Note: the constructors clamps aCode to valid NS_ERROR_DOM_INDEXEDDB_*
  // values (see ClampResultCode)
  MOZ_IMPLICIT TransactionOpResult(nsresult aCode = NS_OK);
  // Use this constructor only when there is an error (i.e. aCode != NS_OK)
  // for which you would like to a custom and meaningful error message to the
  // developers.
  TransactionOpResult(nsresult aCode, const nsACString& aErrorMessage);

  friend struct IPC::ParamTraits<TransactionOpResult>;
};

}  // namespace mozilla::dom::indexedDB

#endif  // DOM_INDEXEDDB_TRANSACTION_OP_RESULT_H_
