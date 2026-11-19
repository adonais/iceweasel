/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MediaTransportTypes_h
#define mozilla_dom_MediaTransportTypes_h

#include <string>

#include "mozilla/dom/RTCErrorBinding.h"
#include "nsString.h"

namespace mozilla::dom {

struct RTCErrorParams {
  RTCErrorInit errorInit;
  std::string message;
};

struct IceCandidateAttributePair {
  // |candidate:...|-form attribute strings (no leading "a=")
  // Used by OnConnectionStateChange to pass the currently selected candidate
  // pair, if one exists.
  nsCString local;
  nsCString remote;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_MediaTransportTypes_h
