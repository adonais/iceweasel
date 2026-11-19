/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef AppleFastDatapathProbe_h_
#define AppleFastDatapathProbe_h_

namespace mozilla::net {

// Probes whether the Apple private sendmsg_x/recvmsg_x APIs work on a
// background thread, records the result as a Glean metric and, if they do,
// enables the fast datapath for QUIC sockets. Parent process main thread only;
// does nothing after the first call, and records false if the pref is off.
void StartAppleFastDatapathProbe();

}  // namespace mozilla::net

#endif  // AppleFastDatapathProbe_h_
