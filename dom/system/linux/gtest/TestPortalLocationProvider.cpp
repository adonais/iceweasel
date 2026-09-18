/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PortalLocationProvider.h"
#include "gtest/gtest.h"
#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsIGeolocationProvider.h"
#include "nsITimer.h"
#include "nsServiceManagerUtils.h"
#include "nsString.h"
#include "nsTArray.h"

using namespace mozilla::dom;

namespace {

class NullGeolocationUpdate final : public nsIGeolocationUpdate {
 public:
  NS_DECL_ISUPPORTS
  NS_IMETHOD Update(nsIDOMGeoPosition*) override { return NS_OK; }
  NS_IMETHOD NotifyError(uint16_t) override { return NS_OK; }

 private:
  ~NullGeolocationUpdate() = default;
};

NS_IMPL_ISUPPORTS(NullGeolocationUpdate, nsIGeolocationUpdate)

// The MLS fallback handoff timer is named after its nsINamed callback, so the
// number of live fallbacks equals the number of armed timers with that name.
size_t CountMLSFallbackTimers() {
  nsCOMPtr<nsITimerManager> manager =
      do_GetService("@mozilla.org/timer-manager;1");
  if (!manager) {
    return 0;
  }
  nsTArray<RefPtr<nsITimer>> timers;
  if (NS_FAILED(manager->GetTimers(timers))) {
    return 0;
  }
  size_t count = 0;
  for (const auto& timer : timers) {
    nsAutoCString name;
    if (NS_SUCCEEDED(timer->GetName(name)) &&
        name.EqualsLiteral("MLSFallback")) {
      count++;
    }
  }
  return count;
}

}  // namespace

// Without a portal position each Watch() arms an MLS fallback; repeated calls
// must reuse the pending one.
TEST(PortalLocationProvider, RepeatedWatchReusesPendingFallback)
{
  ASSERT_EQ(0u, CountMLSFallbackTimers());

  RefPtr<PortalLocationProvider> provider = new PortalLocationProvider();
  RefPtr<NullGeolocationUpdate> callback = new NullGeolocationUpdate();

  ASSERT_EQ(NS_OK, provider->Watch(callback));
  EXPECT_EQ(1u, CountMLSFallbackTimers());

  ASSERT_EQ(NS_OK, provider->Watch(callback));
  ASSERT_EQ(NS_OK, provider->Watch(callback));
  EXPECT_EQ(1u, CountMLSFallbackTimers());

  ASSERT_EQ(NS_OK, provider->Shutdown());
  EXPECT_EQ(0u, CountMLSFallbackTimers());
}
