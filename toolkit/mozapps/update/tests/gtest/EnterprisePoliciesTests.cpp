/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "EnterprisePolicies.h"
#include "TestDirHelpers.h"

#include <filesystem>
#include <fstream>
#include <string_view>
#include <windows.h>

namespace fs = std::filesystem;

class EnterprisePoliciesInDistributionTest : public ::testing::Test {
 protected:
  fs::path mTempDir;
  fs::path mDistDir;

  void SetUp() override { CreateDistributionDir(); }

  void TearDown() override { RemoveDir(mTempDir); }

  void WritePoliciesJson(std::string_view aContent) {
    std::ofstream out(mDistDir / "policies.json");
    out << aContent;
  }

 private:
  void CreateDistributionDir() {
    mTempDir = CreateTempDir();
    EXPECT_FALSE(mTempDir.empty());

    mDistDir = mTempDir / "distribution";
    std::error_code ec;
    fs::create_directory(mDistDir, ec);
    EXPECT_FALSE(ec);
  }
};

TEST_F(EnterprisePoliciesInDistributionTest, NoDistributionDir) {
  RemoveDir(mDistDir);
  EXPECT_FALSE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, EmptyFile) {
  WritePoliciesJson("");
  EXPECT_FALSE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, InvalidJson) {
  WritePoliciesJson("Test");
  EXPECT_FALSE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, NoPoliciesKey) {
  WritePoliciesJson(R"({"Test": true})");
  EXPECT_FALSE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, PoliciesIsNotObject) {
  WritePoliciesJson(R"({"policies": "Test"})");
  EXPECT_FALSE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, PoliciesIsArray) {
  WritePoliciesJson(R"({"policies": [1, 2, 3]})");
  EXPECT_FALSE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, EmptyPoliciesObject) {
  WritePoliciesJson(R"({"policies": {}})");
  EXPECT_FALSE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, SinglePolicy) {
  WritePoliciesJson(R"({"policies": {"Test": true}})");
  EXPECT_TRUE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, MultiplePolicies) {
  WritePoliciesJson(R"({
    "policies": {
      "Test1": true,
      "Test2": true
    }
  })");
  EXPECT_TRUE(EnterprisePolicies::InDistribution(mTempDir));
}

TEST_F(EnterprisePoliciesInDistributionTest, NestedPolicies) {
  WritePoliciesJson(R"({
    "policies": {
      "Test1": {
        "Test2": true
      }
    }
  })");
  EXPECT_TRUE(EnterprisePolicies::InDistribution(mTempDir));
}
