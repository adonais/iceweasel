/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_WEBTRANSPORT_API_WEBTRANSPORTDATAGRAMSWRITABLE_H_
#define DOM_WEBTRANSPORT_API_WEBTRANSPORTDATAGRAMSWRITABLE_H_

#include "mozilla/dom/WritableStream.h"

namespace mozilla::dom {

class WebTransport;
class WebTransportSendGroup;
class WebTransportDatagramDuplexStream;
class OutgoingDatagramStreamAlgorithms;

class WebTransportDatagramsWritable final : public WritableStream {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(WebTransportDatagramsWritable,
                                           WritableStream)

  WebTransportDatagramsWritable(nsIGlobalObject* aGlobal,
                                WebTransport* aTransport,
                                WebTransportSendGroup* aSendGroup,
                                int64_t aSendOrder);

  static already_AddRefed<WebTransportDatagramsWritable> Create(
      JSContext* aCx, nsIGlobalObject* aGlobal, WebTransport* aTransport,
      WebTransportDatagramDuplexStream* aDatagrams, double aHighWaterMark,
      WebTransportSendGroup* aSendGroup, int64_t aSendOrder, ErrorResult& aRv);

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  WebTransportSendGroup* GetSendGroup() const { return mSendGroup; }
  void SetSendGroup(WebTransportSendGroup* aSendGroup, ErrorResult& aRv);

  int64_t SendOrder() const { return mSendOrder; }
  void SetSendOrder(int64_t aSendOrder);

 private:
  ~WebTransportDatagramsWritable() override;

  RefPtr<WebTransport> mTransport;
  RefPtr<WebTransportSendGroup> mSendGroup;
  int64_t mSendOrder;

  // The algorithm instance for this writable stream. This allows each
  // WebTransportDatagramsWritable to have its own sendGroup/sendOrder.
  RefPtr<OutgoingDatagramStreamAlgorithms> mAlgorithms;
};

}  // namespace mozilla::dom

#endif  // DOM_WEBTRANSPORT_API_WEBTRANSPORTDATAGRAMSWRITABLE_H_
