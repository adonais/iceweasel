/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "elevation_type.h"

static bool mockUserHasAdminPrivileges = false;
static bool mockUserIsLocalSystem = false;
static bool mockError = false;

#ifdef XP_WIN
#  include "mozilla/WinHeaderOnlyUtils.h"

// Mocks for testing
namespace mozilla {

LauncherResult<bool> UserHasAdminPrivileges() {
  if (mockError) {
    return LAUNCHER_ERROR_GENERIC();
  }
  return mockUserHasAdminPrivileges;
}

LauncherResult<bool> UserIsLocalSystem() {
  if (mockError) {
    return LAUNCHER_ERROR_GENERIC();
  }
  return mockUserIsLocalSystem;
}

}  // namespace mozilla
#endif

class ElevationTypeTest : public ::testing::Test {
  void SetUp() override {
    // Reset mocks before every test
    mockUserHasAdminPrivileges = false;
    mockUserIsLocalSystem = false;
    mockError = false;
  }

  void TearDown() override {}
};

TEST_F(ElevationTypeTest, IsProcessElevated_NotElevatedTest) {
  BoolResult res = isProcessElevated();
  EXPECT_EQ(res, BoolResult::False);
}

#ifdef XP_WIN
TEST_F(ElevationTypeTest, IsProcessElevated_LocalSystemElevatedTest) {
  mockUserIsLocalSystem = true;
  BoolResult res = isProcessElevated();
  EXPECT_EQ(res, BoolResult::True);
}

TEST_F(ElevationTypeTest, IsProcessElevated_AdminElevatedTest) {
  mockUserHasAdminPrivileges = true;
  BoolResult res = isProcessElevated();
  EXPECT_EQ(res, BoolResult::True);
}
TEST_F(ElevationTypeTest, IsProcessElevated_ErrorTest) {
  mockError = true;
  BoolResult res = isProcessElevated();
  EXPECT_EQ(res, BoolResult::Error);
}
TEST_F(ElevationTypeTest, GetElevationType_NotElevated) {
  ElevationType elevationType = getElevationType();
  EXPECT_EQ(elevationType, ElevationType::None);
}

TEST_F(ElevationTypeTest, GetElevationType_ElevatedNotMMS) {
  mockUserIsLocalSystem = true;
  putenv("MOZ_USING_SERVICE=");
  ElevationType elevationType = getElevationType();
  EXPECT_EQ(elevationType, ElevationType::ElevatedWithoutMMS);
}
TEST_F(ElevationTypeTest, GetElevationType_ElevatedMMS) {
  mockUserIsLocalSystem = true;
  putenv("MOZ_USING_SERVICE=1");
  ElevationType elevationType = getElevationType();
  putenv("MOZ_USING_SERVICE=");
  EXPECT_EQ(elevationType, ElevationType::ElevatedByMMS);
}

TEST_F(ElevationTypeTest, GetElevationType_Error) {
  mockError = true;
  ElevationType elevationType = getElevationType();
  EXPECT_EQ(elevationType, ElevationType::Error);
}

TEST_F(ElevationTypeTest, IsValidInvocationForElevationType_First_NotElevated) {
  bool isValid = isValidInvocationForElevationType(UpdaterInvocation::First,
                                                   ElevationType::None);
  EXPECT_TRUE(isValid);
}

TEST_F(ElevationTypeTest,
       IsValidInvocationForElevationType_First_ElevatedNotMMS) {
  bool isValid = isValidInvocationForElevationType(
      UpdaterInvocation::First, ElevationType::ElevatedWithoutMMS);
  EXPECT_TRUE(isValid);
}
TEST_F(ElevationTypeTest, IsValidInvocationForElevationType_First_ElevatedMMS) {
  bool isValid = isValidInvocationForElevationType(
      UpdaterInvocation::First, ElevationType::ElevatedByMMS);
  EXPECT_FALSE(isValid);
}
TEST_F(ElevationTypeTest, IsValidInvocationForElevationType_First_Error) {
  bool isValid = isValidInvocationForElevationType(UpdaterInvocation::First,
                                                   ElevationType::Error);
  EXPECT_FALSE(isValid);
}
TEST_F(ElevationTypeTest, IsValidInvocationForElevationType_First_Unknown) {
  bool isValid = isValidInvocationForElevationType(UpdaterInvocation::First,
                                                   ElevationType::Unknown);
  EXPECT_FALSE(isValid);
}
TEST_F(ElevationTypeTest,
       IsValidInvocationForElevationType_Second_NotElevated) {
  bool isValid = isValidInvocationForElevationType(UpdaterInvocation::Second,
                                                   ElevationType::None);
  EXPECT_TRUE(isValid);
}
TEST_F(ElevationTypeTest,
       IsValidInvocationForElevationType_Second_ElevatedNotMMS) {
  bool isValid = isValidInvocationForElevationType(
      UpdaterInvocation::Second, ElevationType::ElevatedWithoutMMS);
  EXPECT_TRUE(isValid);
}
TEST_F(ElevationTypeTest,
       IsValidInvocationForElevationType_Second_ElevatedMMS) {
  bool isValid = isValidInvocationForElevationType(
      UpdaterInvocation::Second, ElevationType::ElevatedByMMS);
  EXPECT_TRUE(isValid);
}
TEST_F(ElevationTypeTest, IsValidInvocationForElevationType_Second_Error) {
  bool isValid = isValidInvocationForElevationType(UpdaterInvocation::Second,
                                                   ElevationType::Error);
  EXPECT_FALSE(isValid);
}
TEST_F(ElevationTypeTest, IsValidInvocationForElevationType_Second_Unknown) {
  bool isValid = isValidInvocationForElevationType(UpdaterInvocation::Second,
                                                   ElevationType::Unknown);
  EXPECT_FALSE(isValid);
}
#elif defined(XP_MACOSX)
TEST_F(ElevationTypeTest, IsProcessElevated_NonElevatedCmd) {
  BoolResult res = isProcessElevated("hello there");
  EXPECT_EQ(res, BoolResult::False);
}

TEST_F(ElevationTypeTest, IsProcessElevated_ElevatedCmd) {
  BoolResult res =
      isProcessElevated("/Library/PrivilegedHelperTools/org.mozilla.updater");
  EXPECT_EQ(res, BoolResult::True);
}
#endif
