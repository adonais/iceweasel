/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_PUSH_DECLARATIVE_H_
#define DOM_PUSH_DECLARATIVE_H_

#include "mozilla/Span.h"
#include "nsStringFwd.h"

class nsIPrincipal;

namespace mozilla::dom {

// Parse Declarative Push message.
// https://w3c.github.io/push-api/#declarative-push-message
// If successful, shows the notification and returns true.
bool ParseDeclarativePushAndShowNotification(Span<const uint8_t> aData,
                                             nsIPrincipal* aPrincipal,
                                             const nsACString& aScope);

}  // namespace mozilla::dom

#endif  // DOM_PUSH_DECLARATIVE_H_
