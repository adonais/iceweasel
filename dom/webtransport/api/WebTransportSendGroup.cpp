/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebTransportSendGroup.h"

#include "mozilla/dom/Promise.h"
#include "mozilla/dom/WebTransport.h"
#include "mozilla/dom/WebTransportLog.h"
#include "mozilla/dom/WebTransportSendReceiveStreamBinding.h"

namespace mozilla::dom {

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(WebTransportSendGroup, mGlobal,
                                      mWebTransport)
NS_IMPL_CYCLE_COLLECTING_ADDREF(WebTransportSendGroup)
NS_IMPL_CYCLE_COLLECTING_RELEASE(WebTransportSendGroup)
NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(WebTransportSendGroup)
  NS_WRAPPERCACHE_INTERFACE_MAP_ENTRY
  NS_INTERFACE_MAP_ENTRY(nsISupports)
NS_INTERFACE_MAP_END

WebTransportSendGroup::WebTransportSendGroup(nsIGlobalObject* aGlobal,
                                             WebTransport* aWebTransport)
    : mGlobal(aGlobal), mWebTransport(aWebTransport) {
  LOG(("WebTransportSendGroup %p created", this));
}

WebTransportSendGroup::~WebTransportSendGroup() {
  LOG(("WebTransportSendGroup %p destroyed", this));
}

JSObject* WebTransportSendGroup::WrapObject(JSContext* aCx,
                                            JS::Handle<JSObject*> aGivenProto) {
  return WebTransportSendGroup_Binding::Wrap(aCx, this, aGivenProto);
}

already_AddRefed<Promise> WebTransportSendGroup::GetStats(ErrorResult& aRv) {
  LOG(("WebTransportSendGroup::GetStats() called"));

  RefPtr<Promise> promise = Promise::Create(mGlobal, aRv);
  if (aRv.Failed()) {
    return nullptr;
  }

  // TODO
  WebTransportSendStreamStats stats;

  promise->MaybeResolve(stats);
  return promise.forget();
}

}  // namespace mozilla::dom
