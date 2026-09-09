/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "mozilla/Preferences.h"
#include "mozilla/browser/NimbusFeatures.h"

using namespace mozilla;

static bool gTestIntUpdated = false;
static bool gEnabledUpdated = false;

static constexpr auto TEST_FEATURE = "testFeature"_ns;
static constexpr auto TEST_INT = "testInt"_ns;
static constexpr auto ENABLED = "enabled"_ns;

namespace {

namespace prefs::rollout {
static constexpr auto TEST_FEATURE_ENABLED =
    "nimbus.syncdefaultsstore.testFeature.enabled";
static constexpr auto TEST_FEATURE_TEST_INT =
    "nimbus.syncdefaultsstore.testFeature.testInt";
}  // namespace prefs::rollout

namespace prefs::experiment {
static constexpr auto TEST_FEATURE_ENABLED =
    "nimbus.syncdatastore.testFeature.enabled";
static constexpr auto TEST_FEATURE_TEST_INT =
    "nimbus.syncdatastore.testFeature.testInt";
}  // namespace prefs::experiment

namespace prefs::fallback {
static constexpr auto TEST_FEATURE_TEST_INT = "nimbus.testing.testInt";
}

}  // namespace

TEST(NimbusFeaturesGet, Errors)
{
  ASSERT_EQ(Preferences::SetInt(prefs::experiment::TEST_FEATURE_TEST_INT, 42,
                                PrefValueKind::User),
            NS_OK);
  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), 42);
  ASSERT_EQ(Preferences::SetBool(prefs::experiment::TEST_FEATURE_ENABLED, true,
                                 PrefValueKind::User),
            NS_OK);
  ASSERT_TRUE(NimbusFeatures::GetBool(TEST_FEATURE, ENABLED, false));

  ASSERT_EQ(Preferences::ClearUser(prefs::experiment::TEST_FEATURE_TEST_INT),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::experiment::TEST_FEATURE_ENABLED),
            NS_OK);
}

TEST(NimbusFeaturesGetRollout, Errors)
{
  ASSERT_EQ(Preferences::SetInt(prefs::rollout::TEST_FEATURE_TEST_INT, 7,
                                PrefValueKind::User),
            NS_OK);
  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), 7);
  ASSERT_EQ(Preferences::SetBool(prefs::rollout::TEST_FEATURE_ENABLED, true,
                                 PrefValueKind::User),
            NS_OK);
  ASSERT_TRUE(NimbusFeatures::GetBool(TEST_FEATURE, ENABLED, false));

  ASSERT_EQ(Preferences::ClearUser(prefs::rollout::TEST_FEATURE_TEST_INT),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::rollout::TEST_FEATURE_ENABLED),
            NS_OK);
}

TEST(NimbusFeaturesExperimentPriorityOverRollouts, Errors)
{
  ASSERT_EQ(Preferences::SetInt(prefs::experiment::TEST_FEATURE_TEST_INT, 12,
                                PrefValueKind::User),
            NS_OK);
  ASSERT_EQ(Preferences::SetInt(prefs::rollout::TEST_FEATURE_TEST_INT, 22,
                                PrefValueKind::User),
            NS_OK);
  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), 12);
  ASSERT_EQ(Preferences::SetBool(prefs::experiment::TEST_FEATURE_ENABLED, true,
                                 PrefValueKind::User),
            NS_OK);
  ASSERT_EQ(Preferences::SetBool(prefs::rollout::TEST_FEATURE_ENABLED, false,
                                 PrefValueKind::User),
            NS_OK);
  ASSERT_TRUE(NimbusFeatures::GetBool(TEST_FEATURE, ENABLED, false));

  ASSERT_EQ(Preferences::ClearUser(prefs::experiment::TEST_FEATURE_TEST_INT),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::experiment::TEST_FEATURE_ENABLED),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::rollout::TEST_FEATURE_TEST_INT),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::rollout::TEST_FEATURE_ENABLED),
            NS_OK);
}

TEST(NimbusFeaturesDataSourcePrecedence, Errors)
{
  const auto FALLBACK_VALUE = 1;
  const auto EXPERIMENT_VALUE = 2;
  const auto ROLLOUT_VALUE = 3;

  ASSERT_EQ(Preferences::SetInt(prefs::fallback::TEST_FEATURE_TEST_INT,
                                FALLBACK_VALUE, PrefValueKind::User),
            NS_OK);

  // If there is no experiment or rollout, the fallback value should be
  // returned.
  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), FALLBACK_VALUE);

  // Enroll in an experiment.
  ASSERT_EQ(Preferences::SetInt(prefs::experiment::TEST_FEATURE_TEST_INT,
                                EXPERIMENT_VALUE, PrefValueKind::User),
            NS_OK);

  // Enroll in a rollout.
  ASSERT_EQ(Preferences::SetInt(prefs::rollout::TEST_FEATURE_TEST_INT,
                                ROLLOUT_VALUE, PrefValueKind::User),
            NS_OK);

  // Experiment value should take precedence.
  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0),
            EXPERIMENT_VALUE);

  // After experiments it should default to rollouts.
  Preferences::ClearUser(prefs::experiment::TEST_FEATURE_TEST_INT);
  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), ROLLOUT_VALUE);

  // Cleanup
  ASSERT_EQ(Preferences::ClearUser(prefs::rollout::TEST_FEATURE_TEST_INT),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::fallback::TEST_FEATURE_TEST_INT),
            NS_OK);
}

static void TestFeatureTestIntUpdated(const char* aPref, void* aUserData) {
  ASSERT_STREQ(aPref, prefs::experiment::TEST_FEATURE_TEST_INT);
  ASSERT_EQ(aUserData, reinterpret_cast<void*>(13));

  ASSERT_FALSE(gTestIntUpdated);
  gTestIntUpdated = true;

  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), 24);
}

static void TestFeatureEnabledUpdated(const char* aPref, void* aUserData) {
  ASSERT_STREQ(aPref, prefs::rollout::TEST_FEATURE_ENABLED);

  ASSERT_FALSE(gEnabledUpdated);
  gEnabledUpdated = true;
}

TEST(NimbusFeaturesUpdate, Errors)
{
  // Verify updating testFeature.testInt calls TestFeatureTestIntUpdated and not
  // TestFeatureEnabledUpdated.
  ASSERT_EQ(NimbusFeatures::OnUpdate(TEST_FEATURE, TEST_INT,
                                     TestFeatureTestIntUpdated,
                                     reinterpret_cast<void*>(13)),
            NS_OK);
  ASSERT_EQ(
      NimbusFeatures::OnUpdate(TEST_FEATURE, ENABLED, TestFeatureEnabledUpdated,
                               reinterpret_cast<void*>(13)),
      NS_OK);
  ASSERT_EQ(Preferences::SetInt(prefs::experiment::TEST_FEATURE_TEST_INT, 24,
                                PrefValueKind::User),
            NS_OK);
  ASSERT_TRUE(gTestIntUpdated);
  ASSERT_FALSE(gEnabledUpdated);
  gTestIntUpdated = false;

  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), 24);

  // Verify updating testFeature.enabled calls TestFeatureEnabledUpdated and not
  // TestFeatureTestIntUpdated.
  ASSERT_EQ(Preferences::SetBool(prefs::rollout::TEST_FEATURE_ENABLED, false,
                                 PrefValueKind::User),
            NS_OK);
  ASSERT_FALSE(NimbusFeatures::GetBool(TEST_FEATURE, ENABLED, true));
  ASSERT_FALSE(gTestIntUpdated);
  ASSERT_TRUE(gEnabledUpdated);
  gEnabledUpdated = false;

  // Verify OffUpdate requires a matching user data pointer to unregister.
  ASSERT_EQ(NimbusFeatures::OffUpdate(TEST_FEATURE, TEST_INT,
                                      TestFeatureTestIntUpdated,
                                      reinterpret_cast<void*>(14)),
            NS_ERROR_FAILURE);

  // Verify updating testFeature.testInt no longer calls
  // TestFeatureTestIntUpdated after it has been unregistered.
  ASSERT_EQ(NimbusFeatures::OffUpdate(TEST_FEATURE, TEST_INT,
                                      TestFeatureTestIntUpdated,
                                      reinterpret_cast<void*>(13)),
            NS_OK);
  ASSERT_EQ(Preferences::SetInt(prefs::experiment::TEST_FEATURE_TEST_INT, 25,
                                PrefValueKind::User),
            NS_OK);
  ASSERT_EQ(NimbusFeatures::GetInt(TEST_FEATURE, TEST_INT, 0), 25);

  ASSERT_EQ(NimbusFeatures::OffUpdate(TEST_FEATURE, ENABLED,
                                      TestFeatureEnabledUpdated,
                                      reinterpret_cast<void*>(13)),
            NS_OK);

  ASSERT_EQ(Preferences::ClearUser(prefs::experiment::TEST_FEATURE_TEST_INT),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::experiment::TEST_FEATURE_ENABLED),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::rollout::TEST_FEATURE_TEST_INT),
            NS_OK);
  ASSERT_EQ(Preferences::ClearUser(prefs::rollout::TEST_FEATURE_ENABLED),
            NS_OK);
}
