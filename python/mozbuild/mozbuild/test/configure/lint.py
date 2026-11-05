# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import unittest
from collections import Counter

import mozpack.path as mozpath
from buildconfig import topobjdir, topsrcdir
from mozunit import main
from mozversioncontrol import get_repository_object

from mozbuild.configure.lint import LintSandbox, find_unreferenced_configs

test_path = os.path.abspath(__file__)

PROJECTS = (
    "browser",
    "js",
    "memory",
    "mobile/android",
)

ALLOWED_UNREFERENCED_CONFIGS = (
    "MOZ_DISABLE_PROFILE_PKCS11_MODULES",
    "MOZ_ENTERPRISE_CONSOLE_URL",
)


class LintMeta(type):
    def __new__(mcs, name, bases, attrs):
        def create_test(project, func):
            def test(self):
                return func(self, project)

            return test

        for project in PROJECTS:
            attrs["test_%s" % project.replace("/", "_")] = create_test(
                project, attrs["lint"]
            )

        return type.__new__(mcs, name, bases, attrs)


class Lint(unittest.TestCase, metaclass=LintMeta):
    def setUp(self):
        self._curdir = os.getcwd()
        os.chdir(topobjdir)

    def tearDown(self):
        os.chdir(self._curdir)

    def lint(self, project):
        sandbox = LintSandbox(
            {
                "MOZCONFIG": os.path.join(
                    os.path.dirname(test_path), "data", "empty_mozconfig"
                ),
            },
            ["configure", "--enable-project=%s" % project, "--help"],
        )
        sandbox.run(os.path.join(topsrcdir, "moz.configure"))
        return sandbox

    def test_unreferenced_set_config(self):
        set_configs = {}
        for project in PROJECTS:
            set_configs.update(self.lint(project).set_configs)
        paths = [
            p
            for p, _ in get_repository_object(topsrcdir)
            .get_tracked_files_finder()
            .find("**")
            if not p.startswith("python/mozbuild/mozbuild/test/configure/")
        ]
        unreferenced = [
            f'`set_config("{name}")` '
            f"({mozpath.relpath(set_configs[name][0], topsrcdir)}:{set_configs[name][1]}) "
            "sets a value that nothing reads. Remove the `set_config` call, or add "
            "the name to `ALLOWED_UNREFERENCED_CONFIGS` in "
            f"{mozpath.relpath(test_path, topsrcdir)} if something reads it "
            "dynamically."
            for name in find_unreferenced_configs(
                set_configs.keys() - ALLOWED_UNREFERENCED_CONFIGS, topsrcdir, paths
            )
        ]
        if unreferenced:
            self.fail("\n".join(unreferenced))

    def test_unreferenced_depends(self):
        references = Counter()
        for project in PROJECTS:
            sandbox = self.lint(project)
            references.update(sandbox.defined_depends.values())
            references.subtract(sandbox.unreferenced_depends())
        messages = [
            f"`{name}` ({mozpath.relpath(path, topsrcdir)}:{line}) returns a value "
            "that nothing reads. Remove the `return` value, and the function "
            "too if it does nothing else."
            for name, path, line in sorted(
                (location for location, count in references.items() if count == 0),
                key=lambda location: location[1:],
            )
        ]
        if messages:
            self.fail("\n".join(messages))


if __name__ == "__main__":
    main()
