/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ImagePixelFormat.h"
#include "WebCodecsUtils.h"
#include "gtest/gtest.h"
#include "mozilla/EnumeratedRange.h"
#include "mozilla/dom/BindingUtils.h"
#include "mozilla/dom/VideoFrameBinding.h"
#include "nsString.h"

using namespace mozilla;
using namespace mozilla::dom;

// An internal format has a web name iff a web format is spelled the same way.
TEST(TestWebCodecsUtils, ToVideoPixelFormatMatchesNames)
{
  for (auto format : MakeInclusiveEnumeratedRange(kHighestImagePixelFormat)) {
    const nsDependentCString name(EnumValueToString(format));
    EXPECT_EQ(ToVideoPixelFormat(format), StringToEnum<VideoPixelFormat>(name))
        << name.get();
  }
}

// Every web format is the name of an internal format.
TEST(TestWebCodecsUtils, ToVideoPixelFormatCoversWebFormats)
{
  for (auto web : MakeWebIDLEnumeratedRange<VideoPixelFormat>()) {
    bool named = false;
    for (auto format : MakeInclusiveEnumeratedRange(kHighestImagePixelFormat)) {
      named |= ToVideoPixelFormat(format) == Some(web);
    }
    EXPECT_TRUE(named) << GetEnumString(web).get();
  }
}
