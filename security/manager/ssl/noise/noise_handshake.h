/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _noise_handshake_h_
#define _noise_handshake_h_

#include "nsISupportsUtils.h"  // for nsresult, etc.

extern "C" {
nsresult ctap_cable_handshake_service_constructor(REFNSIID iid, void** result);
};

#endif  // _noise_handshake_h_
