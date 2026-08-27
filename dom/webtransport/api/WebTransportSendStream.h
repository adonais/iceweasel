/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_WEBTRANSPORT_API_WEBTRANSPORTSENDSTREAM_H_
#define DOM_WEBTRANSPORT_API_WEBTRANSPORTSENDSTREAM_H_

#include "mozilla/dom/WritableStream.h"

namespace mozilla::ipc {
class DataPipeSender;
}

namespace mozilla::dom {

class WebTransport;
class WebTransportSendGroup;

class WebTransportSendStream final : public WritableStream {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(WebTransportSendStream,
                                           WritableStream)

  WebTransportSendStream(nsIGlobalObject* aGlobal, WebTransport* aTransport);

  static already_AddRefed<WebTransportSendStream> Create(
      WebTransport* aWebTransport, nsIGlobalObject* aGlobal, uint64_t aStreamId,
      mozilla::ipc::DataPipeSender* aSender, int64_t aSendOrder,
      WebTransportSendGroup* aSendGroup, ErrorResult& aRv);

  // WebIDL Boilerplate
  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  // WebIDL Interface
  int64_t SendOrder() { return mSendOrder; }

  void SetSendOrder(int64_t aSendOrder);

  WebTransportSendGroup* GetSendGroup() { return mSendGroup; }

  void SetSendGroup(WebTransportSendGroup* aSendGroup, ErrorResult& aRv);

  already_AddRefed<Promise> GetStats();

 private:
  ~WebTransportSendStream() override { mozilla::DropJSObjects(this); };

  // We must hold a reference to the WebTransport so it can't go away on
  // us.  This forms a cycle with WebTransport that will be broken when the
  // CC runs.   WebTransport::CleanUp() will destroy all the send and receive
  // streams, breaking the cycle.
  RefPtr<WebTransport> mTransport;
  RefPtr<WebTransportSendGroup> mSendGroup;
  uint64_t mStreamId;
  int64_t mSendOrder;
};
}  // namespace mozilla::dom

#endif
