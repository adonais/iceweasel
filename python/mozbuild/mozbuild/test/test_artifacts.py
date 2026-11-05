# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import tempfile
import zipfile
from unittest import TestCase, mock

import buildconfig
import mozpack.path as mozpath
import mozunit

from mozbuild.artifacts import (
    AndroidArtifactJob,
    ArtifactJob,
    Artifacts,
    GeckoJobConfiguration,
    LinuxArtifactJob,
    MacArtifactJob,
    ThunderbirdJobConfiguration,
    UnfilteredProjectPackageArtifactJob,
    WinArtifactJob,
)


class FakeArtifactJob(ArtifactJob):
    package_re = r""
    job_configuration = GeckoJobConfiguration


class TestArtifactJob(TestCase):
    def _assert_candidate_trees(self, version_display, expected_trees):
        with mock.patch.object(
            buildconfig, "substs", {"MOZ_APP_VERSION_DISPLAY": version_display}
        ):
            job = FakeArtifactJob()
            self.assertGreater(len(job.candidate_trees), 0)
            self.assertEqual(job.candidate_trees, expected_trees)

    def test_candidate_trees_with_empty_file(self):
        self._assert_candidate_trees(
            version_display="",
            expected_trees=GeckoJobConfiguration.default_candidate_trees,
        )

    def test_candidate_trees_with_beta_version(self):
        self._assert_candidate_trees(
            version_display="92.1b2",
            expected_trees=GeckoJobConfiguration.beta_candidate_trees,
        )

    def test_candidate_trees_with_esr_version(self):
        self._assert_candidate_trees(
            version_display="91.3.0esr",
            expected_trees=GeckoJobConfiguration.esr_candidate_trees,
        )

    def test_candidate_trees_with_nightly_version(self):
        self._assert_candidate_trees(
            version_display="95.0a1",
            expected_trees=GeckoJobConfiguration.nightly_candidate_trees,
        )

    def test_candidate_trees_with_release_version(self):
        self._assert_candidate_trees(
            version_display="93.0.1",
            expected_trees=GeckoJobConfiguration.default_candidate_trees,
        )

    def test_candidate_trees_with_newline_before_version(self):
        self._assert_candidate_trees(
            version_display="\n\n91.3.0esr",
            expected_trees=GeckoJobConfiguration.esr_candidate_trees,
        )

    def test_property_is_cached(self):
        job = FakeArtifactJob()
        expected_trees = GeckoJobConfiguration.esr_candidate_trees

        buildconfig.substs["MOZ_APP_VERSION_DISPLAY"] = "91.3.0.esr"
        self.assertEqual(job.candidate_trees, expected_trees)
        # Because the property is cached, changing the
        # `MOZ_APP_VERSION_DISPLAY` won't have any impact.
        buildconfig.substs["MOZ_APP_VERSION_DISPLAY"] = ""
        self.assertEqual(job.candidate_trees, expected_trees)


class TestLicensesArtifact(TestCase):
    def test_only_filtered_jobs_download_licenses_json(self):
        artifacts = [{"name": "public/build/licenses.json"}]
        linux = LinuxArtifactJob(download_tests=False)
        self.assertEqual(
            list(linux.find_candidate_artifacts(artifacts)),
            ["public/build/licenses.json"],
        )
        unfiltered = UnfilteredProjectPackageArtifactJob(download_tests=False)
        self.assertEqual(list(unfiltered.find_candidate_artifacts(artifacts)), [])

    def test_licenses_json_is_installed_for_gen_license_html(self):
        job = FakeArtifactJob(download_tests=False)
        with tempfile.TemporaryDirectory() as tmpdir:
            downloaded = os.path.join(tmpdir, "0123456789abcdef-licenses.json")
            with open(downloaded, "w") as fh:
                fh.write("{}")
            job.process_artifact(downloaded, downloaded + ".jar")
            with zipfile.ZipFile(downloaded + ".jar") as zf:
                self.assertEqual(zf.namelist(), ["licenses.artifact.json"])


class TestTestArtifactPatterns(TestCase):
    JOB_CLASSES = (
        ArtifactJob,
        AndroidArtifactJob,
        LinuxArtifactJob,
        MacArtifactJob,
        WinArtifactJob,
    )

    def _resolve(self, job_class, entry):
        """Mimic how `process_tests_*_artifact` maps an archive entry: the first
        matching pattern wins."""
        for pattern, (src_prefix, dest_prefix) in job_class.test_artifact_patterns:
            if mozpath.match(entry, pattern):
                return mozpath.join(dest_prefix, mozpath.relpath(entry, src_prefix))
        return None

    def test_patterns_are_ordered(self):
        # Several patterns overlap, so an unordered container (e.g. a set) makes
        # the mapping depend on PYTHONHASHSEED.
        for job_class in self.JOB_CLASSES:
            self.assertIsInstance(
                job_class.test_artifact_patterns, (list, tuple), job_class.__name__
            )

    def test_gmp_plugins_land_in_bin(self):
        # The fake GMP plugin libraries must end up in dist/bin so that
        # test_archive.py packages them; landing them in dist/plugins silently
        # drops them from the test archive and crashes the GMP child process.
        for job_class in self.JOB_CLASSES:
            for entry in (
                "bin/plugins/gmp-fake/1.0/libfake.so",
                "bin/plugins/gmp-fakeopenh264/1.0/libfakeopenh264.so",
                "bin/plugins/gmp-clearkey/0.1/libclearkey.so",
            ):
                self.assertEqual(
                    self._resolve(job_class, entry),
                    mozpath.join("bin", mozpath.relpath(entry, "bin/plugins")),
                    f"{job_class.__name__}: {entry}",
                )

    def test_other_plugins_land_in_plugins(self):
        for job_class in self.JOB_CLASSES:
            self.assertEqual(
                self._resolve(job_class, "bin/plugins/libnptest.so"),
                "plugins/libnptest.so",
                job_class.__name__,
            )


class TestThunderbirdMixin(TestCase):
    def _assert_candidate_trees(self, version_display, source_repo, expected_trees):
        with mock.patch.object(
            buildconfig,
            "substs",
            {
                "MOZ_APP_VERSION_DISPLAY": version_display,
                "MOZ_SOURCE_REPO": source_repo,
            },
        ):
            job = FakeArtifactJob(
                override_job_configuration=ThunderbirdJobConfiguration
            )
            self.assertGreater(len(job.candidate_trees), 0)
            self.assertEqual(job.candidate_trees, expected_trees)

    def test_candidate_trees_with_beta_version(self):
        self._assert_candidate_trees(
            version_display="92.1b2",
            source_repo="https://hg.mozilla.org/releases/comm-beta",
            expected_trees=ThunderbirdJobConfiguration.beta_candidate_trees,
        )

    def test_candidate_trees_with_esr_version(self):
        self._assert_candidate_trees(
            version_display="91.3.0esr",
            source_repo="https://hg.mozilla.org/releases/comm-esr91",
            expected_trees=ThunderbirdJobConfiguration.esr_candidate_trees,
        )

    def test_candidate_trees_with_nightly_version(self):
        self._assert_candidate_trees(
            version_display="95.0a1",
            source_repo="https://hg.mozilla.org/comm-central",
            expected_trees=ThunderbirdJobConfiguration.nightly_candidate_trees,
        )

    def test_candidate_trees_with_release_version(self):
        self._assert_candidate_trees(
            version_display="93.0.1",
            source_repo="https://hg.mozilla.org/releases/comm-release",
            expected_trees=ThunderbirdJobConfiguration.default_candidate_trees,
        )

    def test_property_is_cached(self):
        job = FakeArtifactJob(override_job_configuration=ThunderbirdJobConfiguration)
        expected_trees = ThunderbirdJobConfiguration.esr_candidate_trees

        buildconfig.substs["MOZ_APP_VERSION_DISPLAY"] = "91.3.0.esr"
        self.assertEqual(job.candidate_trees, expected_trees)
        # Because the property is cached, changing the
        # `MOZ_APP_VERSION_DISPLAY` won't have any impact.
        buildconfig.substs["MOZ_APP_VERSION_DISPLAY"] = ""
        self.assertEqual(job.candidate_trees, expected_trees)


class FakePushheadCache:
    """A pushlog where each tree maps revisions to the (id, head) of the push
    containing them, and push ids to their head, recording the requests."""

    def __init__(self, pushes):
        self.pushes = pushes
        self.requests = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def parent_push(self, tree, revision):
        self.requests.append((tree, revision))
        for pushid, (head, revs) in self.pushes[tree].items():
            if revision in revs:
                return pushid, head
        raise ValueError

    def parent_pushhead_id(self, tree, revision):
        return self.parent_push(tree, revision)[0]

    def pushid_range(self, tree, start, end):
        self.requests.append((tree, start, end))
        return [
            head
            for pushid, (head, _) in sorted(self.pushes[tree].items())
            if start < pushid <= end
        ]


class TestFindPushheads(TestCase):
    TREES = ["mozilla-central", "integration/autoland"]

    def find_pushheads(self, pushes, revs):
        artifacts = Artifacts.__new__(Artifacts)
        artifacts._log = None
        artifacts._git = None
        artifacts._jj = None
        artifacts._artifact_job = mock.Mock(candidate_trees=self.TREES)
        artifacts._pushhead_cache = FakePushheadCache(pushes)
        artifacts._get_recent_public_revisions = lambda: revs
        return artifacts._find_pushheads(), artifacts._pushhead_cache

    def test_first_revision_is_pushhead(self):
        pushes = {
            "mozilla-central": {
                100: ("c", {"a", "b", "c"}),
                101: ("f", {"d", "e", "f"}),
            },
            "integration/autoland": {
                500: ("d", {"d"}),
                501: ("e", {"e"}),
                502: ("f", {"f"}),
            },
        }
        pushheads, cache = self.find_pushheads(pushes, ["f", "e", "d", "c"])

        self.assertEqual(next(pushheads), (["mozilla-central"], "f"))
        self.assertEqual(cache.requests, [("mozilla-central", "f")])

        self.assertEqual(
            list(pushheads),
            [
                (["integration/autoland"], "f"),
                (["integration/autoland"], "e"),
                (["integration/autoland"], "d"),
                (["mozilla-central"], "c"),
            ],
        )

    def test_first_revision_is_not_pushhead(self):
        pushes = {
            "mozilla-central": {
                100: ("c", {"a", "b", "c"}),
                101: ("f", {"d", "e", "f"}),
            },
            "integration/autoland": {500: ("d", {"d"}), 501: ("f", {"e", "f"})},
        }
        pushheads, cache = self.find_pushheads(pushes, ["e", "d", "c"])

        self.assertEqual(
            list(pushheads),
            [
                (["integration/autoland"], "d"),
                (["mozilla-central"], "c"),
            ],
        )


class TestShallowCloneRevisions(TestCase):
    REPO = "https://github.com/mozilla-releng/git-backing"

    def get_revisions(self, shallow, env):
        artifacts = Artifacts.__new__(Artifacts)
        artifacts._log = None
        artifacts._git = "git"
        artifacts._jj = None
        artifacts._topsrcdir = "/src"
        outputs = {"rev-parse": "head\n", "fetch": "", "rev-list": "a\nb\n"}
        artifacts.check_git_output = mock.Mock(
            side_effect=lambda args, **kwargs: outputs[args[0]]
        )

        vcs = mock.Mock(is_shallow=shallow)

        with mock.patch.dict(os.environ, env, clear=True):
            with mock.patch(
                "mozbuild.artifacts.get_repository_object", return_value=vcs
            ):
                with mock.patch.object(
                    Artifacts, "_is_git_cinnabar", new_callable=mock.PropertyMock
                ) as cinnabar:
                    with mock.patch.object(
                        Artifacts, "_git_repo_kind", new_callable=mock.PropertyMock
                    ) as kind:
                        cinnabar.return_value = False
                        kind.return_value = "firefox"
                        revs = artifacts._get_revisions_from_git()
        fetches = [
            tuple(c.args[0])
            for c in artifacts.check_git_output.call_args_list
            if c.args[0][0] == "fetch"
        ]
        return revs, fetches

    def test_shallow_automation_clone_is_deepened(self):
        env = {"MOZ_AUTOMATION": "1", "MOZ_SOURCE_GIT_REPO": self.REPO}
        revs, fetches = self.get_revisions(True, env)

        self.assertEqual(revs, ["a", "b"])
        self.assertEqual(
            fetches,
            [
                (
                    "fetch",
                    "--no-tags",
                    "--deepen=500",
                    "--filter=tree:0",
                    self.REPO,
                    "head",
                )
            ],
        )

    def test_full_clone_is_not_deepened(self):
        env = {"MOZ_AUTOMATION": "1", "MOZ_SOURCE_GIT_REPO": self.REPO}
        revs, fetches = self.get_revisions(False, env)

        self.assertEqual(revs, ["a", "b"])
        self.assertEqual(fetches, [])

    def test_shallow_local_clone_is_not_deepened(self):
        revs, fetches = self.get_revisions(True, {})

        self.assertEqual(revs, ["a", "b"])
        self.assertEqual(fetches, [])


if __name__ == "__main__":
    mozunit.main()
