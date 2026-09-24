/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_extensions_NativeMessagingProxy_h
#define mozilla_extensions_NativeMessagingProxy_h

#include "nsINativeMessagingProxy.h"

#include <gio/gio.h>

#include "mozilla/GRefPtr.h"
#include "mozilla/MozPromise.h"
#include "nsString.h"
#include "nsTArray.h"

namespace mozilla::extensions {

class NativeMessagingProxy : public nsINativeMessagingProxy {
 public:
  NS_DECL_NSINATIVEMESSAGINGPROXY
  NS_DECL_ISUPPORTS

  static already_AddRefed<NativeMessagingProxy> GetSingleton();

 private:
  NativeMessagingProxy();
  virtual ~NativeMessagingProxy();

  RefPtr<GDBusProxy> mProxy;
  RefPtr<GCancellable> mCancellable;
  RefPtr<GenericNonExclusivePromise> mAvailablePromise;

  nsTArray<nsCString> mSessions;
};

}  // namespace mozilla::extensions

#endif  // mozilla_extensions_NativeMessagingProxy_h
