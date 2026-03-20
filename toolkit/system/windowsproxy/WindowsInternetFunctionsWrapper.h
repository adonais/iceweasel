/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_toolkit_system_windowsproxy_WindowsInternetFunctionsWrapper_h
#define mozilla_toolkit_system_windowsproxy_WindowsInternetFunctionsWrapper_h

#include <windows.h>

#include "mozilla/Atomics.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/WeakPtr.h"
#include "nsCOMPtr.h"
#include "nsError.h"
#include "nsIObserver.h"
#include "nsISupportsImpl.h"
#include "nsString.h"

namespace mozilla::widget::WinRegistry {
class KeyWatcher;
}

namespace mozilla {
namespace toolkit {
namespace system {

class NetworkLinkObserver;

class WindowsInternetFunctionsWrapper : public mozilla::SupportsWeakPtr {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(WindowsInternetFunctionsWrapper)

  WindowsInternetFunctionsWrapper();

  void Init();
  void Shutdown();
  virtual nsresult ReadInternetOption(uint32_t aOption, uint32_t& aFlags,
                                      nsAString& aValue);

 protected:
  virtual ~WindowsInternetFunctionsWrapper();

 private:
  friend class NetworkLinkObserver;

  nsresult ReadAllOptionsLocked(DWORD aConnFlags, const nsString& aConnName);

  // Connection state cache, invalidated by NS_NETWORK_LINK_TOPIC.
  mozilla::Atomic<bool> mConnCacheValid{false};
  DWORD mCachedConnFlags{0};
  // Empty string means LAN/WiFi; non-empty stores the modem connection name.
  nsString mCachedConnName;

  // Proxy options cache, invalidated by registry key changes.
  mozilla::Atomic<bool> mCacheValid{false};
  uint32_t mCachedFlags = 0;
  nsString mCachedProxyServer;
  nsString mCachedProxyBypass;
  nsString mCachedAutoConfigUrl;

  mozilla::UniquePtr<mozilla::widget::WinRegistry::KeyWatcher> mKeyWatcher;
  nsCOMPtr<nsIObserver> mNetworkLinkObserver;
};

}  // namespace system
}  // namespace toolkit
}  // namespace mozilla

#endif  // mozilla_toolkit_system_windowsproxy_WindowsInternetFunctionsWrapper_h
