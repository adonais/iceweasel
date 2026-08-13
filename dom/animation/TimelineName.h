/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_TimelineName_h
#define mozilla_dom_TimelineName_h

#include "mozilla/RefPtr.h"
#include "mozilla/ServoStyleConsts.h"

namespace mozilla::dom {

struct OwningScopedTimelineName;
struct ScopedTimelineName {
  const nsAtom* mName;
  StyleCascadeLevel mCascadeLevel;

  bool operator==(const ScopedTimelineName& aOther) const {
    return mName == aOther.mName && mCascadeLevel == aOther.mCascadeLevel;
  }

  bool operator!=(const ScopedTimelineName& aOther) const {
    return !(*this == aOther);
  }

  ScopedTimelineName() : mName{nullptr}, mCascadeLevel{} {}
  explicit ScopedTimelineName(const OwningScopedTimelineName& aOther);
  explicit ScopedTimelineName(const StyleTimelineName& aOther);
};

struct OwningScopedTimelineName {
  RefPtr<const nsAtom> mName;
  StyleCascadeLevel mCascadeLevel;

  bool operator==(const ScopedTimelineName& aOther) const {
    return mName.get() == aOther.mName && mCascadeLevel == aOther.mCascadeLevel;
  }

  bool operator!=(const ScopedTimelineName& aOther) const {
    return !(*this == aOther);
  }
  OwningScopedTimelineName() : mName{}, mCascadeLevel{} {}
  explicit OwningScopedTimelineName(const ScopedTimelineName& aName)
      : mName{aName.mName}, mCascadeLevel{aName.mCascadeLevel} {}
};

}  // namespace mozilla::dom

#endif
