# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from marionette_harness import MarionetteTestCase

RECOMMENDED_PREF = "remote.prefs.recommended.applied"


class TestRecommendedPreferences(MarionetteTestCase):
    def setUp(self):
        super(TestRecommendedPreferences, self).setUp()

        self.marionette.set_context("chrome")

    def tearDown(self):
        # A failing test leaves the recommended preferences in the profile.
        self.marionette.restart(in_app=False, clean=True)

        super(TestRecommendedPreferences, self).tearDown()

    def has_user_value(self, pref):
        with self.marionette.using_context("chrome"):
            return self.marionette.execute_script(
                "return Services.prefs.prefHasUserValue(arguments[0]);",
                script_args=(pref,),
            )

    def apply_recommended_prefs(self):
        with self.marionette.using_context("chrome"):
            self.marionette.execute_script(
                """
                Services.prefs.setBoolPref("remote.prefs.recommended", true);
                ChromeUtils.importESModule(
                  "chrome://remote/content/shared/RecommendedPreferences.sys.mjs"
                ).RecommendedPreferences.applyPreferences();
                """,
            )

    def test_restored_after_in_app_restart(self):
        # Initially, recommended pref should have no user value.
        self.assertFalse(self.has_user_value(RECOMMENDED_PREF))

        # Apply recommended preferences, the recommended pref should now have a
        # user value.
        self.apply_recommended_prefs()
        self.assertTrue(self.has_user_value(RECOMMENDED_PREF))

        self.marionette.restart(in_app=True)

        # Note: this is set to false in user.js for this test suite, so the
        # preference set in apply_recommended_prefs does not survive a restart.
        self.assertFalse(
            self.marionette.get_pref("remote.prefs.recommended"),
            "Recommended preferences are disabled again after the restart",
        )
        self.assertFalse(
            self.has_user_value(RECOMMENDED_PREF),
            "The recommended preference was restored after the restart",
        )
