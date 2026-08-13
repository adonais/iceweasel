/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIconProtocolHandler.h"

#include "nsCOMPtr.h"
#include "nsCRT.h"
#include "nsContentUtils.h"
#include "nsIconChannel.h"
#include "nsIconURI.h"
#include "nsNetCID.h"

///////////////////////////////////////////////////////////////////////////////

nsIconProtocolHandler::nsIconProtocolHandler() = default;

nsIconProtocolHandler::~nsIconProtocolHandler() = default;

NS_IMPL_ISUPPORTS(nsIconProtocolHandler, nsIProtocolHandler,
                  nsISupportsWeakReference)

///////////////////////////////////////////////////////////////////////////////
// nsIProtocolHandler methods:

NS_IMETHODIMP
nsIconProtocolHandler::GetScheme(nsACString& result) {
  result = "moz-icon";
  return NS_OK;
}

NS_IMETHODIMP
nsIconProtocolHandler::AllowPort(int32_t port, const char* scheme,
                                 bool* _retval) {
  // don't override anything.
  *_retval = false;
  return NS_OK;
}

NS_IMETHODIMP
nsIconProtocolHandler::NewChannel(nsIURI* aUrl, nsILoadInfo* aLoadInfo,
                                  nsIChannel** result) {
  if (!nsContentUtils::IsImageType(aLoadInfo->GetExternalContentPolicyType())) {
    return NS_ERROR_CONTENT_BLOCKED;
  }

  nsIconChannel* channel = new nsIconChannel;
  if (!channel) {
    return NS_ERROR_OUT_OF_MEMORY;
  }
  NS_ADDREF(channel);

  nsresult rv = channel->Init(aUrl, aLoadInfo);
  if (NS_FAILED(rv)) {
    NS_RELEASE(channel);
    return rv;
  }

  *result = channel;
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////
