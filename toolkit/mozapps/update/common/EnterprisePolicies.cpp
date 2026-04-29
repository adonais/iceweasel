/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EnterprisePolicies.h"

#include <filesystem>
#include <fstream>
#include <Windows.h>

#include <json/json.h>

namespace fs = std::filesystem;

namespace {

static fs::path GetDistributionPoliciesFilePath(const fs::path& aDir) noexcept {
  const fs::path kRelativeFilePath{"distribution/policies.json"};
  return aDir / kRelativeFilePath;
}

}  // namespace

namespace EnterprisePolicies {

bool InDistribution(const std::filesystem::path& aDir) {
  Json::CharReaderBuilder builder;
  std::ifstream file(GetDistributionPoliciesFilePath(aDir));
  Json::Value root;
  std::string errors;
  if (!Json::parseFromStream(builder, file, &root, &errors)) {
    return false;
  }

  if (!root.isObject() || !root.isMember("policies")) {
    return false;
  }

  const Json::Value& policies = root["policies"];
  return !(!policies.isObject() || policies.empty());
}

}  // namespace EnterprisePolicies
