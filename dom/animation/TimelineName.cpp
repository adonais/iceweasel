/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/TimelineName.h"

namespace mozilla::dom {

ScopedTimelineName::ScopedTimelineName(const OwningScopedTimelineName& aOther)
    : mName{aOther.mName.get()}, mCascadeLevel{aOther.mCascadeLevel} {}

ScopedTimelineName::ScopedTimelineName(const StyleTimelineName& aOther)
    : mName{aOther.value.AsAtom()}, mCascadeLevel{aOther.scope} {}

}  // namespace mozilla::dom
