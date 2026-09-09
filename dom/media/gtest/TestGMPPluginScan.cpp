/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GMPUtils.h"
#include "gtest/gtest.h"
#include "mozilla/MozPromise.h"
#include "mozilla/gtest/WaitFor.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"

namespace mozilla {

// Each test below must be alone in its suite, because each has to be the first
// thing in its process to touch the GMP service. What they guard against is a
// query being answered before the scan of MOZ_GMP_PATH has finished registering
// the plugins it found. Each suite gets its own process, see
// testing/gtest/suites.py, except under --combine-suites (tsan, Android) where
// all but the first are vacuous rather than wrong.

static void ExpectPluginsFromEnvironment() {
  // Query gmp-fake first, and keep it first. It is described by a Chromium
  // manifest.json, and parsing that has to round trip to the main thread, so it
  // is registered a few tasks after the scan itself has run. That makes it the
  // plugin a scan barrier is most likely to miss. See bug 2050519.
  EXPECT_TRUE(HaveGMPFor(nsLiteralCString(CHROMIUM_CDM_API), {"fake"_ns}));

  // gmp-fakeopenh264 is described by an .info file, read on the GMP thread as
  // part of the scan itself.
  EXPECT_TRUE(HaveGMPFor("decode-video"_ns, {"h264"_ns}));
  EXPECT_TRUE(HaveGMPFor("encode-video"_ns, {"h264"_ns}));
}

TEST(GMPPluginScan, PluginsFromEnvironmentAreVisibleToTheFirstQuery)
{
  ExpectPluginsFromEnvironment();
}

TEST(GMPPluginScanOffMainThread,
     PluginsFromEnvironmentAreVisibleToTheFirstQuery)
{
  // Background task queues run on a thread pool, whose workers refuse
  // dispatches while they are running a task. A scan barrier that waits by
  // dispatching back to the calling thread would therefore never be signalled
  // here.
  nsCOMPtr<nsISerialEventTarget> queue;
  MOZ_ALWAYS_SUCCEEDS(
      NS_CreateBackgroundTaskQueue(__func__, getter_AddRefs(queue)));

  // The main thread has to keep processing events while we wait, because
  // registering gmp-fake parses its manifest.json there.
  (void)WaitFor(InvokeAsync(queue, __func__, [] {
    ExpectPluginsFromEnvironment();
    return GenericPromise::CreateAndResolve(true, __func__);
  }));
}

}  // namespace mozilla
