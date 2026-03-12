import os
import sys

import mozfile

sys.path.append(os.path.dirname(__file__))

from xdg_config_home_test_case import XdgConfigHomeTestCase


class TestXdgConfigHomeLegacyDirOnly(XdgConfigHomeTestCase):
    """
    Test that when legacy directory exists but profiles.ini doesn't,
    Firefox uses XDG directory instead.

    This tests the scenario where ~/.mozilla/firefox directory exists
    (perhaps from a previous Firefox version or manual creation) but
    profiles.ini does not exist. In this case, Firefox should treat it
    as a fresh install and use the XDG Base Directory specification,
    creating the profile in ~/.config/mozilla/firefox/ instead.
    """

    def setUp(self):
        # Create legacy directory WITHOUT profiles.ini
        self.legacy_dir = os.path.join(self.homedir, ".mozilla", "firefox")
        os.makedirs(self.legacy_dir, exist_ok=True)

        # Verify profiles.ini does NOT exist
        legacy_profiles_ini = os.path.join(self.legacy_dir, "profiles.ini")
        assert not os.path.exists(legacy_profiles_ini), (
            "profiles.ini should not exist in legacy directory"
        )

        # Also create some dummy files in legacy dir to make it look "real"
        # This simulates a case where the directory exists but was never
        # properly initialized by Firefox
        dummy_file = os.path.join(self.legacy_dir, "dummy.txt")
        with open(dummy_file, "w") as f:
            f.write("This is a dummy file\n")

        super().setUp()

    def tearDown(self):
        if os.path.exists(self.legacy_dir):
            mozfile.remove(self.legacy_dir)
            assert not os.path.exists(self.legacy_dir)
        super().tearDown()

    def test_profile_dir_uses_xdg(self):
        """Should create profile in XDG directory, not legacy"""
        self.client.navigate(self.about_support)

        profile_subdir = self.get_asserted_profile_subdir()
        print(f"profile_subdir={profile_subdir}")

        # Should use XDG, not legacy
        self.assertTrue(
            profile_subdir.startswith(".config/mozilla/firefox"),
            f"Profile should be under XDG .config/mozilla/firefox, "
            f"not legacy .mozilla/firefox. Got: {profile_subdir}",
        )

    def test_profiles_ini_created_in_xdg(self):
        """Verify profiles.ini was created in XDG location, not legacy"""
        self.client.navigate(self.about_support)

        # profiles.ini should be in XDG directory
        xdg_profiles_ini = os.path.join(
            self.homedir, ".config", "mozilla", "firefox", "profiles.ini"
        )
        self.assertTrue(
            os.path.exists(xdg_profiles_ini),
            f"profiles.ini should be created in XDG directory: {xdg_profiles_ini}",
        )

        # profiles.ini should NOT be in legacy directory
        legacy_profiles_ini = os.path.join(self.legacy_dir, "profiles.ini")
        self.assertFalse(
            os.path.exists(legacy_profiles_ini),
            f"profiles.ini should NOT be created in legacy directory: {legacy_profiles_ini}",
        )
