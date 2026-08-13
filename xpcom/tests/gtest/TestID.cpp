/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsID.h"
#include "nsLiteralString.h"

static const nsLiteralCString ids[] = {
    "5C347B10-D55C-11D1-89B7-006008911B81"_ns,
    "{5C347B10-D55C-11D1-89B7-006008911B81}"_ns,
    "5c347b10-d55c-11d1-89b7-006008911b81"_ns,
    "{5c347b10-d55c-11d1-89b7-006008911b81}"_ns,

    "FC347B10-D55C-F1D1-F9B7-006008911B81"_ns,
    "{FC347B10-D55C-F1D1-F9B7-006008911B81}"_ns,
    "fc347b10-d55c-f1d1-f9b7-006008911b81"_ns,
    "{fc347b10-d55c-f1d1-f9b7-006008911b81}"_ns,
};
#define NUM_IDS ((int)(sizeof(ids) / sizeof(ids[0])))

TEST(nsID, StringConversion)
{
  nsID id;
  for (int i = 0; i < NUM_IDS; i++) {
    const nsLiteralCString& idstr = ids[i];
    ASSERT_TRUE(id.Parse(idstr.AsString()));

    auto cp = id.ToString();
    ASSERT_STREQ(cp.get(), ids[4 * (i / 4) + 3].get());
  }
}
