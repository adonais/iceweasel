/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_gtest_ScopedPrefSetter_h
#define mozilla_gtest_ScopedPrefSetter_h

#include "mozilla/Assertions.h"
#include "mozilla/Attributes.h"
#include "mozilla/Preferences.h"
#include "nsThreadUtils.h"

namespace mozilla {

// Sets a boolean preference for the lifetime of the instance and restores the
// previous value on destruction, so a test does not leak its pref change into
// later tests. Must be constructed and destroyed on the main thread.
class MOZ_RAII ScopedPrefSetter {
 public:
  ScopedPrefSetter(const char* aPrefName, bool aValue)
      : mPrefName(aPrefName),
        mOriginalValue(Preferences::GetBool(aPrefName, false)) {
    MOZ_ASSERT(NS_IsMainThread());
    Preferences::SetBool(mPrefName, aValue);
  }
  ~ScopedPrefSetter() {
    MOZ_ASSERT(NS_IsMainThread());
    Preferences::SetBool(mPrefName, mOriginalValue);
  }

  ScopedPrefSetter(const ScopedPrefSetter&) = delete;
  ScopedPrefSetter& operator=(const ScopedPrefSetter&) = delete;
  ScopedPrefSetter(ScopedPrefSetter&&) = delete;
  ScopedPrefSetter& operator=(ScopedPrefSetter&&) = delete;

 private:
  const char* mPrefName;
  const bool mOriginalValue;
};

}  // namespace mozilla

#endif  // mozilla_gtest_ScopedPrefSetter_h
