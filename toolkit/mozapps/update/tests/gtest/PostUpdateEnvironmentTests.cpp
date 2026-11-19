/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "PostUpdateEnvironment.h"

#include <string>
#include <string_view>
#include <vector>
#include <windows.h>

namespace {

constexpr WCHAR kMarkerName[]{L"POST_UPDATE_ENVIRONMENT_TEST_MARKER"};

std::vector<std::wstring> ReadEntries(LPVOID aBlock) {
  std::vector<std::wstring> entries;
  LPCWSTR cursor{static_cast<LPCWSTR>(aBlock)};
  while (*cursor) {
    entries.emplace_back(cursor);
    cursor += entries.back().size() + 1;
  }
  return entries;
}

bool HasVariable(const std::vector<std::wstring>& aEntries,
                 std::wstring_view aName) {
  for (const std::wstring& entry : aEntries) {
    if (entry.size() > aName.size() && entry[aName.size()] == L'=' &&
        _wcsnicmp(entry.c_str(), aName.data(), aName.size()) == 0) {
      return true;
    }
  }
  return false;
}

}  // namespace

class PostUpdateEnvironmentTest : public ::testing::Test {
 protected:
  void SetUp() override {
    ASSERT_TRUE(SetEnvironmentVariableW(kMarkerName, L"1"));
  }

  void TearDown() override { SetEnvironmentVariableW(kMarkerName, nullptr); }
};

TEST_F(PostUpdateEnvironmentTest, UnelevatedUsesDefaultUserEnvironment) {
  PostUpdateEnvironment postUpdateEnvironment{ElevationType::None};
  ASSERT_NE(postUpdateEnvironment.get(), nullptr);

  std::vector<std::wstring> entries{ReadEntries(postUpdateEnvironment.get())};
  EXPECT_FALSE(entries.empty());
  EXPECT_TRUE(HasVariable(entries, L"USERPROFILE"));
}

TEST_F(PostUpdateEnvironmentTest, UnelevatedDropsInheritedVariables) {
  PostUpdateEnvironment postUpdateEnvironment{ElevationType::None};
  ASSERT_NE(postUpdateEnvironment.get(), nullptr);

  EXPECT_FALSE(
      HasVariable(ReadEntries(postUpdateEnvironment.get()), kMarkerName));
}

TEST_F(PostUpdateEnvironmentTest, ElevatedByMMSIsEmpty) {
  PostUpdateEnvironment postUpdateEnvironment{ElevationType::ElevatedByMMS};
  ASSERT_NE(postUpdateEnvironment.get(), nullptr);
  EXPECT_TRUE(ReadEntries(postUpdateEnvironment.get()).empty());
}

TEST_F(PostUpdateEnvironmentTest, ElevatedWithoutMMSIsEmpty) {
  PostUpdateEnvironment postUpdateEnvironment{
      ElevationType::ElevatedWithoutMMS};
  ASSERT_NE(postUpdateEnvironment.get(), nullptr);
  EXPECT_TRUE(ReadEntries(postUpdateEnvironment.get()).empty());
}

TEST_F(PostUpdateEnvironmentTest, UnknownIsEmpty) {
  PostUpdateEnvironment postUpdateEnvironment{ElevationType::Unknown};
  ASSERT_NE(postUpdateEnvironment.get(), nullptr);
  EXPECT_TRUE(ReadEntries(postUpdateEnvironment.get()).empty());
}

TEST_F(PostUpdateEnvironmentTest, ErrorIsEmpty) {
  PostUpdateEnvironment postUpdateEnvironment{ElevationType::Error};
  ASSERT_NE(postUpdateEnvironment.get(), nullptr);
  EXPECT_TRUE(ReadEntries(postUpdateEnvironment.get()).empty());
}
