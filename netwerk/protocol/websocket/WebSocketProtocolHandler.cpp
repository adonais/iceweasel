/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebSocketProtocolHandler.h"

#include "BaseWebSocketChannel.h"
#include "WebSocketChannel.h"
#include "WebSocketChannelChild.h"
#include "WebSocketLog.h"
#include "mozilla/RefPtr.h"
#include "mozilla/net/NeckoCommon.h"
#include "nsIWebSocketChannel.h"

namespace mozilla::net {

NS_IMPL_ISUPPORTS(WebSocketProtocolHandler, nsIWebSocketProtocolHandler,
                  nsIProtocolHandler)

/* static */
already_AddRefed<WebSocketProtocolHandler>
WebSocketProtocolHandler::CreateWS() {
  return MakeAndAddRef<WebSocketProtocolHandler>(false);
}

/* static */
already_AddRefed<WebSocketProtocolHandler>
WebSocketProtocolHandler::CreateWSS() {
  return MakeAndAddRef<WebSocketProtocolHandler>(true);
}

NS_IMETHODIMP
WebSocketProtocolHandler::GetScheme(nsACString& aScheme) {
  if (mEncrypted) {
    aScheme.AssignLiteral("wss");
  } else {
    aScheme.AssignLiteral("ws");
  }
  return NS_OK;
}

NS_IMETHODIMP
WebSocketProtocolHandler::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                     nsIChannel** aOutChannel) {
  // nsIWebSocketChannel is not an nsIChannel. Use NewWebSocketChannel().
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
WebSocketProtocolHandler::AllowPort(int32_t aPort, const char* aScheme,
                                    bool* aRetval) {
  // Don't override anything.
  *aRetval = false;
  return NS_OK;
}

NS_IMETHODIMP
WebSocketProtocolHandler::NewWebSocketChannel(nsIWebSocketChannel** aResult) {
  LOG(("WebSocketProtocolHandler::NewWebSocketChannel() %p\n", this));

  RefPtr<BaseWebSocketChannel> channel;
  if (IsNeckoChild()) {
    channel = new WebSocketChannelChild(mEncrypted);
  } else if (mEncrypted) {
    channel = new WebSocketSSLChannel();
  } else {
    channel = new WebSocketChannel();
  }

  channel.forget(aResult);
  return NS_OK;
}

}  // namespace mozilla::net
