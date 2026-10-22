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

    def is_applied(self, pref):
        with self.marionette.using_context("chrome"):
            return self.marionette.execute_script(
                "return Services.prefs.getBoolPref(arguments[0], false);",
                script_args=(pref,),
            )

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

    def assert_restored_after_restart(self, in_app):
        self.assertFalse(self.is_applied(RECOMMENDED_PREF))

        self.apply_recommended_prefs()
        self.assertTrue(self.is_applied(RECOMMENDED_PREF))
        self.assertFalse(
            self.has_user_value(RECOMMENDED_PREF),
            "Recommended preferences are not set on the user branch",
        )

        self.marionette.restart(in_app=in_app)

        # Note: this is set to false in user.js for this test suite, so the
        # preference set in apply_recommended_prefs does not survive a restart.
        self.assertFalse(
            self.marionette.get_pref("remote.prefs.recommended"),
            "Recommended preferences are disabled again after the restart",
        )
        self.assertFalse(
            self.is_applied(RECOMMENDED_PREF),
            "The recommended preference was not persisted across the restart",
        )

    def test_restored_after_in_app_restart(self):
        self.assert_restored_after_restart(in_app=True)

    def test_restored_after_forced_restart(self):
        # Killing the process skips the orderly shutdown entirely, which is
        # what happens when the application crashes or is killed by the OS.
        self.assert_restored_after_restart(in_app=False)
