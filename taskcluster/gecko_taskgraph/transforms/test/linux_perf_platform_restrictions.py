# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Talos tests that must remain on linux1804
TALOS_LINUX_1804_TESTS = {
    "talos-damp-inspector",
    "talos-damp-webconsole",
    "talos-chrome",
}

# Browsertime/Raptor tests that must remain on linux1804 (pattern, app)
BROWSERTIME_LINUX_1804_PATTERNS = [
    ("tp6", "chrome"),
    ("tp6", "custom-car"),
    ("wasm-godot", "chrome"),
    ("jetstream2", "chrome"),
]

# Perftest jobs that must remain on linux1804
PERFTEST_LINUX_1804_TESTS = {
    "ml-summarizer-perf",
    "ml-perf-autofill",
    "ml-perf-smart-tab-cluster",
    "ml-perf-suggest-inf",
    "tr8ns-perf-base",
    "ml-llama-summarizer-perf",
    "ml-multi-perf",
    "ml-perf",
    "ml-perf-smart-tab",
    "ml-perf-speecht5-tts",
    "ml-perf-suggest-ft",
    "ml-security-perf",
    "tr8ns-perf-basememory",
    "tr8ns-perf-tiny",
}


def restrict_failing_tests_to_1804(config, tasks):
    """
    Temporary workaround for Bug 1983694 - Restrict talos and browsertime tests
    that fail on Ubuntu 24.04 to run on Ubuntu 18.04 hardware only.

    This transform filters out linux2404 test tasks for tests with known
    failures on Ubuntu 24.04.

    This transform should be removed once all tests are fixed or disabled.
    """
    for task in tasks:
        test_platform = task.get("test-platform", "")
        test_name = task.get("test-name", "")
        app = task.get("app", "firefox")

        if "linux2404" not in test_platform:
            yield task
            continue

        if test_name in TALOS_LINUX_1804_TESTS:
            continue

        should_skip = False
        for pattern, blocked_app in BROWSERTIME_LINUX_1804_PATTERNS:
            if pattern in test_name and app == blocked_app:
                should_skip = True
                break

        if should_skip:
            continue

        yield task


def restrict_perftest_to_1804(config, jobs):
    """
    Temporary workaround for Bug 1983694 - Restrict perftest jobs that fail
    on Ubuntu 24.04 to run on Ubuntu 18.04 hardware only.

    Perftest jobs have a different structure than test tasks - they use a
    'platform' field that is a list of platforms, and 'name' instead of
    'test-name'. This function filters the platform list.
    """
    for job in jobs:
        job_name = job.get("name", "")
        platforms = job.get("platform")

        if job_name in PERFTEST_LINUX_1804_TESTS and isinstance(platforms, list):
            filtered_platforms = [p for p in platforms if "linux2404" not in p]
            if len(filtered_platforms) < len(platforms):
                job["platform"] = filtered_platforms

        yield job
