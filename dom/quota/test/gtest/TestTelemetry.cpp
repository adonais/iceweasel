/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "QuotaManagerDependencyFixture.h"
#include "mozilla/glean/DomQuotaMetrics.h"
#include "mozilla/glean/fog_ffi_generated.h"

namespace mozilla::dom::quota::test {

TEST(DOM_Quota_Telemetry, ShutdownTime)
{
  nsCString empty;
  ASSERT_EQ(NS_OK, glean::impl::fog_test_reset(&empty, &empty));

  ASSERT_NO_FATAL_FAILURE(QuotaManagerDependencyFixture::InitializeFixture());
  ASSERT_NO_FATAL_FAILURE(QuotaManagerDependencyFixture::ShutdownFixture());

  const auto& metric = glean::dom_quota::shutdown_time;

  {
    const auto result = metric.Get("Normal"_ns).TestGetValue();
    ASSERT_TRUE(result.isOk());
    ASSERT_TRUE(result.inspect().isSome());
    EXPECT_EQ(result.inspect()->count, 1u);
  }

  {
    const auto result = metric.Get("WasSuspended"_ns).TestGetValue();
    ASSERT_TRUE(result.isOk());
    EXPECT_TRUE(result.inspect().isNothing());
  }

  {
    const auto result = metric.Get("TimeStampErr1"_ns).TestGetValue();
    ASSERT_TRUE(result.isOk());
    EXPECT_TRUE(result.inspect().isNothing());
  }

  {
    const auto result = metric.Get("TimeStampErr2"_ns).TestGetValue();
    ASSERT_TRUE(result.isOk());
    EXPECT_TRUE(result.inspect().isNothing());
  }
}

}  // namespace mozilla::dom::quota::test
