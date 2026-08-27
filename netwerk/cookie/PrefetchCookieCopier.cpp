/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PrefetchCookieCopier.h"

namespace mozilla::net {

void CopyPrefetchCookies(const nsString& aIsolatedPartitionKey,
                         const OriginAttributes& aDestAttrs) {
  // Spec:
  // https://wicg.github.io/nav-speculation/prefetch.html#copy-prefetch-cookies
  //
  // Same-origin prefetch (M1): the prefetch channel used the document's real
  // partition, so isolated == destination and no copy is needed.
  if (aIsolatedPartitionKey == aDestAttrs.mPartitionKey) {
    return;
  }

  // M2 (cross-origin): copy cookies from the isolated partition to the
  // destination partition via nsICookieManager. Deferred pending M2 work.
}

}  // namespace mozilla::net
