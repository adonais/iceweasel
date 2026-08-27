/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_WebSocketProtocolHandler_h
#define mozilla_net_WebSocketProtocolHandler_h

#include "mozilla/AlreadyAddRefed.h"
#include "nsIProtocolHandler.h"
#include "nsISupportsImpl.h"
#include "nsIWebSocketProtocolHandler.h"

namespace mozilla::net {

// The protocol handler for "ws" (when mEncrypted is false) and "wss" (when
// mEncrypted is true).
class WebSocketProtocolHandler final : public nsIWebSocketProtocolHandler {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIPROTOCOLHANDLER
  NS_DECL_NSIWEBSOCKETPROTOCOLHANDLER

  explicit WebSocketProtocolHandler(bool aEncrypted) : mEncrypted(aEncrypted) {}

  static already_AddRefed<WebSocketProtocolHandler> CreateWS();
  static already_AddRefed<WebSocketProtocolHandler> CreateWSS();

 private:
  ~WebSocketProtocolHandler() = default;

  const bool mEncrypted;
};

}  // namespace mozilla::net

#endif  // mozilla_net_WebSocketProtocolHandler_h
