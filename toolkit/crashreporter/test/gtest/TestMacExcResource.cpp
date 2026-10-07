/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"

#include "breakpad-client/mac/handler/exception_handler.h"

#include <kern/exc_resource.h>
#include <mach/mach.h>
#include <sys/wait.h>
#include <unistd.h>

using google_breakpad::IsNonFatalResourceException;

namespace {

// Mock a EXC_RESOURCE exception, based off
// https://github.com/apple-oss-distributions/xnu/blob/xnu-12377.121.6/osfmk/kern/exc_resource.h#L252
int64_t ResourceCode(uint64_t aType, uint64_t aFlavor, uint64_t aData = 0) {
  return static_cast<int64_t>(((aType & 0x7ULL) << 61) |
                              ((aFlavor & 0x7ULL) << 58) |
                              (aData & 0x3FFFFFFFFFFFFFFULL));
}

}  // namespace

TEST(MacExcResource, CpuMonitorFlavors)
{
  EXPECT_TRUE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_CPU, FLAVOR_CPU_MONITOR)));
  EXPECT_FALSE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_CPU, FLAVOR_CPU_MONITOR_FATAL)));
}

TEST(MacExcResource, NonFatalLimits)
{
  EXPECT_TRUE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_WAKEUPS, FLAVOR_WAKEUPS_MONITOR)));
  EXPECT_TRUE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_MEMORY, FLAVOR_HIGH_WATERMARK)));
  EXPECT_TRUE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_MEMORY, FLAVOR_DIAG_MEMLIMIT)));
  EXPECT_TRUE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_IO, FLAVOR_IO_PHYSICAL_WRITES)));
  EXPECT_TRUE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_IO, FLAVOR_IO_LOGICAL_WRITES)));
  EXPECT_TRUE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_THREADS, FLAVOR_THREADS_HIGH_WATERMARK)));
}

TEST(MacExcResource, FatalLimits)
{
  EXPECT_FALSE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_MEMORY, FLAVOR_CONCLAVE_LIMIT)));
  EXPECT_FALSE(IsNonFatalResourceException(
      ResourceCode(RESOURCE_TYPE_PORTS, FLAVOR_PORT_SPACE_FULL)));
}

TEST(MacExcResource, UnknownResources)
{
  // Those aren't defined at the time of writing
  EXPECT_FALSE(IsNonFatalResourceException(ResourceCode(7, 7)));
  EXPECT_FALSE(IsNonFatalResourceException(ResourceCode(0, 0)));
}
