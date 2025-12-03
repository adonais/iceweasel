# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import os
import pathlib
import sys
import time

import requests
from mozbuild.util import memoize
from taskgraph import create
from taskgraph.util import json
from taskgraph.util.taskcluster import requests_retry_session

try:
    # TODO(py3): use time.monotonic()
    from time import monotonic
except ImportError:
    from time import time as monotonic

BUGBUG_BASE_URL = "https://bugbug.moz.tools"
BUGBUG_BASE_FALLBACK_URL = "https://bugbug.herokuapp.com"
RETRY_TIMEOUT = 9 * 60  # seconds
RETRY_INTERVAL = 10  # seconds

# Preset confidence thresholds.
CT_LOW = 0.7
CT_MEDIUM = 0.8
CT_HIGH = 0.9

GROUP_TRANSLATIONS = {
    "testing/web-platform/tests": "",
    "testing/web-platform/mozilla/tests": "/_mozilla",
}


def translate_group(group):
    for prefix, value in GROUP_TRANSLATIONS.items():
        if group.startswith(prefix):
            return group.replace(prefix, value)

    return group


class BugbugTimeoutException(Exception):
    pass


@memoize
def get_session():
    s = requests.Session()
    s.headers.update({"X-API-KEY": "gecko-taskgraph"})
    return requests_retry_session(retries=5, session=s)


def _next_indexed_path(base_path):
    base_dir = base_path.parent
    stem = base_path.stem
    pattern = f"{stem}-*.json"
    max_index = 1
    for file in base_dir.glob(pattern):
        try:
            index = int(file.stem.replace(stem + "-", ""))
            max_index = max(max_index, index + 1)
        except ValueError:
            continue
    return base_dir / f"{stem}-{max_index}.json"


def _write_perfherder_data(lower_is_better):
    if os.environ.get("MOZ_AUTOMATION", "0") == "1":
        perfherder_data = {
            "framework": {"name": "build_metrics"},
            "suites": [
                {
                    "name": suite,
                    "value": value,
                    "lowerIsBetter": True,
                    "shouldAlert": False,
                    "subtests": [],
                }
                for suite, value in lower_is_better.items()
            ],
        }
        print(f"PERFHERDER_DATA: {json.dumps(perfherder_data)}", file=sys.stderr)
        perfherder_path = os.environ.get("MOZ_PERFHERDER_UPLOAD")
        decision_upload_dir = os.environ.get("MOZ_UPLOAD_DIR")
        if perfherder_path:
            upload_path = pathlib.Path(perfherder_path)
        elif decision_upload_dir:
            upload_path = (
                pathlib.Path(decision_upload_dir) / "perfherder-data-bugbug.json"
            )
        else:
            return

        upload_path.parent.mkdir(parents=True, exist_ok=True)
        target = _next_indexed_path(upload_path)
        with target.open("w", encoding="utf-8") as f:
            json.dump(perfherder_data, f)


@memoize
def push_schedules(branch, rev):
    # Noop if we're in test-action-callback
    if create.testing:
        return

    url = BUGBUG_BASE_URL + f"/push/{branch}/{rev}/schedules"
    fallback_url = url.replace(BUGBUG_BASE_URL, BUGBUG_BASE_FALLBACK_URL)
    start = monotonic()
    session = get_session()

    # On try there is no fallback and pulling is slower, so we allow bugbug more
    # time to compute the results.
    # See https://github.com/mozilla/bugbug/issues/1673.
    timeout = RETRY_TIMEOUT
    if branch == "try":
        timeout += int(timeout / 3)

    attempts = timeout / RETRY_INTERVAL
    i = 0
    success = False
    while i < attempts:
        r = session.get(url)
        r.raise_for_status()

        if r.status_code != 202:
            success = True
            break

        # Trigger the fallback deployment, but ignore it for now.
        r = session.get(fallback_url)
        r.raise_for_status()

        time.sleep(RETRY_INTERVAL)
        i += 1
    end = monotonic()

    if not success:
        i = 0
        while i < attempts:
            r = session.get(fallback_url)
            r.raise_for_status()

            if r.status_code != 202:
                break

            time.sleep(RETRY_INTERVAL)
            i += 1

    _write_perfherder_data(
        lower_is_better={
            "bugbug_push_schedules_time": end - start,
            "bugbug_push_schedules_retries": i,
        }
    )

    data = r.json()
    if r.status_code == 202:
        raise BugbugTimeoutException(f"Timed out waiting for result from '{url}'")

    if "groups" in data:
        data["groups"] = {translate_group(k): v for k, v in data["groups"].items()}

    if "config_groups" in data:
        data["config_groups"] = {
            translate_group(k): v for k, v in data["config_groups"].items()
        }

    return data
