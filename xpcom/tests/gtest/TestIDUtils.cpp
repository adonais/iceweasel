/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsID.h"
#include "nsIDUtils.h"
#include "nsLiteralString.h"

static const nsLiteralCString bare_ids[] = {
    "5c347b10-d55c-11d1-89b7-006008911b81"_ns,
    "fc347b10-d55c-f1d1-f9b7-006008911b81"_ns,
};

TEST(nsIDUtils, NSID_TrimBracketsUTF16)
{
  nsID id{};
  for (const nsLiteralCString& idstr : bare_ids) {
    ASSERT_TRUE(id.Parse(idstr.AsString()));

    NSID_TrimBracketsUTF16 trimmed(id);
    ASSERT_TRUE(trimmed.Equals(NS_ConvertUTF8toUTF16(idstr)));
  }
}

TEST(nsIDUtils, NSID_TrimBracketsASCII)
{
  nsID id{};
  for (const nsLiteralCString& idstr : bare_ids) {
    ASSERT_TRUE(id.Parse(idstr.AsString()));

    NSID_TrimBracketsASCII trimmed(id);
    ASSERT_TRUE(trimmed.Equals(idstr));
  }
}
