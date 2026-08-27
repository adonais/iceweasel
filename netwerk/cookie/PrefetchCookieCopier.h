/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_PrefetchCookieCopier_h
#define mozilla_net_PrefetchCookieCopier_h

#include "mozilla/OriginAttributes.h"
#include "nsString.h"

namespace mozilla::net {

// Implements "copy prefetch cookies": transfers cookies set during the
// prefetch from the isolated partition to the navigation environment's
// partition.
//
// M1/M2 refer to this feature's implementation milestones, not spec
// concepts:
// - Milestone 1 (current): same-origin prefetch only. The prefetch channel
//   already used the document's real partition, so isolated partition ==
//   destination partition and this function is a no-op.
// - Milestone 2 (future): cross-origin prefetch. Will iterate cookies set in
//   the isolated partition and re-add them under the destination partition
//   via nsICookieManager.
//
// Spec:
// https://wicg.github.io/nav-speculation/prefetch.html#copy-prefetch-cookies
void CopyPrefetchCookies(const nsString& aIsolatedPartitionKey,
                         const OriginAttributes& aDestAttrs);

}  // namespace mozilla::net

#endif  // mozilla_net_PrefetchCookieCopier_h
