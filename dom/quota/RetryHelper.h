/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_QUOTA_RETRYHELPER_H_
#define DOM_QUOTA_RETRYHELPER_H_

#include "mozilla/TimeStamp.h"
#include "nsError.h"
#include "prthread.h"

namespace mozilla::dom::quota {

inline bool IsTransientStorageError(nsresult aRv) {
  return aRv == NS_ERROR_STORAGE_BUSY || aRv == NS_ERROR_STORAGE_IOERR ||
         aRv == NS_ERROR_FILE_IS_LOCKED;
}

// Retries aCallable on transient I/O errors with exponential backoff.
// aCallable must return nsresult.
template <typename Callable>
nsresult RetryOnTransientError(
    Callable&& aCallable, uint32_t aInitialSleepMs = 1,
    uint32_t aMaxSleepMs = 100,
    TimeDuration aTimeout = TimeDuration::FromSeconds(10)) {
  nsresult rv = aCallable();
  if (NS_SUCCEEDED(rv) || !IsTransientStorageError(rv)) {
    return rv;
  }

  const TimeStamp start = TimeStamp::NowLoRes();
  uint32_t sleepMs = aInitialSleepMs;
  do {
    PR_Sleep(PR_MillisecondsToInterval(sleepMs));
    sleepMs = std::min(sleepMs * 2, aMaxSleepMs);

    rv = aCallable();
    if (NS_SUCCEEDED(rv) || !IsTransientStorageError(rv)) {
      return rv;
    }
  } while (TimeStamp::NowLoRes() - start < aTimeout);

  return rv;
}

}  // namespace mozilla::dom::quota

#endif  // DOM_QUOTA_RETRYHELPER_H_
