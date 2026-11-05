/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_PUSH_DECLARATIVE_H_
#define DOM_PUSH_DECLARATIVE_H_

#include "mozilla/MozPromise.h"
#include "mozilla/Span.h"
#include "nsStringFwd.h"

class nsIPrincipal;

namespace mozilla::dom {

using DeclarativePushPromise = MozPromise<Ok, nsresult, true>;

// Parse Declarative Push message.
// https://w3c.github.io/push-api/#declarative-push-message
// On success, returns a promise that resolves when the notification is shown.
// If aData is not a valid declarative web push message, returns null.
RefPtr<DeclarativePushPromise> ParseDeclarativePushAndShowNotification(
    Span<const uint8_t> aData, nsIPrincipal* aPrincipal,
    const nsACString& aScope);

}  // namespace mozilla::dom

#endif  // DOM_PUSH_DECLARATIVE_H_
