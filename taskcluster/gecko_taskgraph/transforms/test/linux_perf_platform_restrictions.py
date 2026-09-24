# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Transforms in this file manage the gradual migration of performance tests
# from Ubuntu 18.04 to Ubuntu 24.04 (Bug 1983694). Once all tests have been
# migrated, this file and its registrations in test/__init__.py and
# perftest.py should be removed.

# Talos tests that must remain on linux1804
# Bug 2008057 - Talos tests that keep both linux1804 and linux2404 during
# the migration, so alerts do not miss regressions. Remove this set once the
# linux2404 series has enough history (about two weeks after landing).
TALOS_DUAL_PLATFORM_TESTS = {
    "talos-chrome",
    "talos-damp-inspector",
    "talos-damp-webconsole",
}

# Bug 2008059 - Perftest jobs that keep both linux1804 and linux2404 during
# the migration, so tier 2 alerts do not miss regressions. Remove this set
# when the linux2404 series has enough history.
PERFTEST_DUAL_PLATFORM_TESTS = {
    "tr8ns-perf-base",
    "tr8ns-perf-basememory",
    "tr8ns-perf-tiny",
}


def restrict_tests_to_2404(config, tasks):
    """
    Bug 2021939 - Restrict most perf tests to Ubuntu 24.04 by dropping linux1804
    tasks that are not in the explicit exception lists. Tests in
    TALOS_DUAL_PLATFORM_TESTS keep both platforms.
    """
    for task in tasks:
        if "linux1804" not in task.get("test-platform", ""):
            yield task
            continue

        test_name = task.get("test-name", "")

        if task.get("suite") == "talos":
            if test_name in TALOS_DUAL_PLATFORM_TESTS:
                yield task
            continue

        yield task


def restrict_perftest_to_2404(config, jobs):
    """
    Bug 2021939 - Restrict perftest jobs to Ubuntu 24.04. Remove linux1804
    from the platform list of each job. Jobs in PERFTEST_DUAL_PLATFORM_TESTS
    keep both platforms.
    """
    for job in jobs:
        platforms = job.get("platform")

        if job.get("name", "") not in PERFTEST_DUAL_PLATFORM_TESTS and isinstance(
            platforms, list
        ):
            filtered = [p for p in platforms if "linux1804" not in p]
            if len(filtered) < len(platforms):
                job["platform"] = filtered

        yield job
