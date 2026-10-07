import unittest

import mozunit
from mozharness.base.log import LogMixin
from mozharness.base.script import ScriptMixin
from mozharness.mozilla.building.buildbase import MozconfigPathError, get_mozconfig_path


class FakeLogger:
    def log_message(self, *args, **kwargs):
        pass


class FakeScriptMixin(LogMixin, ScriptMixin):
    def __init__(self):
        self.script_obj = self
        self.log_obj = FakeLogger()


class TestMozconfigPath(unittest.TestCase):
    """
    Tests for :func:`get_mozconfig_path`.
    """

    def test_path(self):
        """
        Passing just ``src_mozconfig`` gives that file in ``abs_src_dir``.
        """
        script = FakeScriptMixin()

        abs_src_path = get_mozconfig_path(
            script,
            config={"src_mozconfig": "path/to/mozconfig"},
            dirs={"abs_src_dir": "/src"},
        )
        self.assertEqual(abs_src_path, "/src/path/to/mozconfig")

    def test_composite(self):
        """
        Passing ``app_name``, ``mozconfig_platform``, and ``mozconfig_variant``
        find the file in the ``config/mozconfigs`` subdirectory of that app
        directory.
        """
        script = FakeScriptMixin()

        config = {
            "app_name": "the-app",
            "mozconfig_variant": "variant",
            "mozconfig_platform": "platform9000",
        }
        abs_src_path = get_mozconfig_path(
            script,
            config=config,
            dirs={"abs_src_dir": "/src"},
        )
        self.assertEqual(
            abs_src_path,
            "/src/the-app/config/mozconfigs/platform9000/variant",
        )

    def test_errors(self):
        script = FakeScriptMixin()

        configs = [
            # Not specifying any parts of a mozconfig path
            {},
            # Specifying src_mozconfig with some or all of a composite
            # mozconfig path
            {
                "src_mozconfig": "path",
                "app_name": "app",
                "mozconfig_platform": "platform",
                "mozconfig_variant": "variant",
            },
            {
                "src_mozconfig": "path",
                "mozconfig_platform": "platform",
                "mozconfig_variant": "variant",
            },
            {
                "src_mozconfig": "path",
                "app_name": "app",
                "mozconfig_variant": "variant",
            },
            {
                "src_mozconfig": "path",
                "app_name": "app",
                "mozconfig_platform": "platform",
            },
            # Specifying only some parts of a compsite mozconfig path
            {"mozconfig_platform": "platform", "mozconfig_variant": "variant"},
            {"app_name": "app", "mozconfig_variant": "variant"},
            {"app_name": "app", "mozconfig_platform": "platform"},
            {"app_name": "app"},
            {"mozconfig_variant": "variant"},
            {"mozconfig_platform": "platform"},
        ]

        for config in configs:
            with self.assertRaises(MozconfigPathError):
                get_mozconfig_path(script, config=config, dirs={})


if __name__ == "__main__":
    mozunit.main()
