/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AndroidLocalNetworkPermission_h_
#define AndroidLocalNetworkPermission_h_

namespace mozilla::net {

// Notified when a connection to the local network is about to be made, so that
// the Android front end can request the OS ACCESS_LOCAL_NETWORK permission if
// it isn't held yet. Carries no subject or data.
#define ANDROID_REQUEST_LOCAL_NETWORK_PERMISSION_TOPIC \
  "network:request-local-network-permission"

// Notified by the front end once it knows whether the app holds
// ACCESS_LOCAL_NETWORK, in response to the topic above. The data is
// u"granted" or u"denied".
#define ANDROID_LOCAL_NETWORK_PERMISSION_RESULT_TOPIC \
  "network:local-network-permission-result"

// Asks the Android front end to request the OS ACCESS_LOCAL_NETWORK permission
// by notifying ANDROID_REQUEST_LOCAL_NETWORK_PERMISSION_TOPIC. Safe to call
// from any thread; the notification is always fired on the main thread.
//
// Asks at most once per foreground cycle, and does nothing at all on Android
// versions predating the permission, so the common case costs one atomic read
// on the socket thread. The cached state is dropped when the app is
// foregrounded, since the user may have changed the permission in Android
// settings while we were in the background.
//
// This deliberately does not block: the caller carries on and connects, and the
// OS will still refuse that attempt when the permission is missing. The point
// is only to get the prompt in front of the user as the connection is made,
// instead of after it has failed, and to do so for subresource loads too.
void RequestAndroidLocalNetworkPermission();

}  // namespace mozilla::net

#endif  // AndroidLocalNetworkPermission_h_
