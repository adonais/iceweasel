/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_WEBTRANSPORT_API_WEBTRANSPORTSENDGROUP_H_
#define DOM_WEBTRANSPORT_API_WEBTRANSPORTSENDGROUP_H_

#include "mozilla/dom/WebTransportSendGroupBinding.h"
#include "nsCOMPtr.h"
#include "nsIGlobalObject.h"
#include "nsISupports.h"
#include "nsWrapperCache.h"

namespace mozilla::dom {

class WebTransport;
class Promise;
struct WebTransportSendStreamOptions;

class WebTransportSendGroup final : public nsISupports, public nsWrapperCache {
  // For mWebTransport access in CreateWritable validation
  friend class WebTransportDatagramDuplexStream;

 public:
  NS_DECL_CYCLE_COLLECTING_ISUPPORTS_FINAL
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(WebTransportSendGroup)

  explicit WebTransportSendGroup(nsIGlobalObject* aGlobal,
                                 WebTransport* aWebTransport);

  nsIGlobalObject* GetParentObject() const { return mGlobal; }

  WebTransport* GetTransport() const { return mWebTransport; }

  void SetGroupId(uint64_t aGroupId) { mGroupId = aGroupId; }
  uint64_t GetGroupId() const { return mGroupId; }

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  already_AddRefed<Promise> GetStats(ErrorResult& aRv);

 private:
  ~WebTransportSendGroup();

  nsCOMPtr<nsIGlobalObject> mGlobal;
  RefPtr<WebTransport> mWebTransport;
  uint64_t mGroupId = 0;
};

}  // namespace mozilla::dom

#endif  // DOM_WEBTRANSPORT_API_WEBTRANSPORTSENDGROUP_H_
