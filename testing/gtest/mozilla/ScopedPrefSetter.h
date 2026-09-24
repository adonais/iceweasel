/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_gtest_ScopedPrefSetter_h
#define mozilla_gtest_ScopedPrefSetter_h

#include <initializer_list>

#include "mozilla/Assertions.h"
#include "mozilla/Attributes.h"
#include "mozilla/Preferences.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

namespace mozilla {

// Sets boolean preferences for the lifetime of the instance and restores the
// previous values on destruction, so a test does not leak its pref changes into
// later tests. Must be constructed and destroyed on the main thread.
class MOZ_RAII ScopedPrefSetter {
 public:
  struct PrefAndValue {
    const char* mPrefName;
    bool mValue;
  };

  ScopedPrefSetter(const char* aPrefName, bool aValue)
      : ScopedPrefSetter({{aPrefName, aValue}}) {}

  explicit ScopedPrefSetter(std::initializer_list<PrefAndValue> aPrefs) {
    MOZ_ASSERT(NS_IsMainThread());
    mOriginalValues.SetCapacity(aPrefs.size());
    for (const auto& pref : aPrefs) {
      mOriginalValues.AppendElement(PrefAndValue{
          pref.mPrefName, Preferences::GetBool(pref.mPrefName, false)});
      Preferences::SetBool(pref.mPrefName, pref.mValue);
    }
  }

  ~ScopedPrefSetter() {
    MOZ_ASSERT(NS_IsMainThread());
    while (!mOriginalValues.IsEmpty()) {
      const auto pref = mOriginalValues.PopLastElement();
      Preferences::SetBool(pref.mPrefName, pref.mValue);
    }
  }

  ScopedPrefSetter(const ScopedPrefSetter&) = delete;
  ScopedPrefSetter& operator=(const ScopedPrefSetter&) = delete;
  ScopedPrefSetter(ScopedPrefSetter&&) = delete;
  ScopedPrefSetter& operator=(ScopedPrefSetter&&) = delete;

 private:
  AutoTArray<PrefAndValue, 1> mOriginalValues;
};

}  // namespace mozilla

#endif  // mozilla_gtest_ScopedPrefSetter_h
