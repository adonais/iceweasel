#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Check that the current sourcemap and worker bundles built for DevTools are up to date.
This job should fail if any file impacting the bundle creation was modified without
regenerating the bundles.

This check should be run after building the bundles via:
cd devtools/client/debugger
yarn && node bin/bundle.js

Those steps are done in the devtools-verify-bundle job, prior to calling this script.
The script checks whether regenerating the bundles changed any file under devtools/,
using the repository's version control system so it works whether the source was
cloned from Mercurial or Git.
"""

import argparse
import json
import sys
from pathlib import Path

from mozversioncontrol import get_repository_object

# Ignore module-manifest.json updates which can randomly happen when
# building bundles.
exclude = ("devtools/client/debugger/bin/module-manifest.json",)

# Detect the repository (Mercurial or Git) so the check is VCS-agnostic.
repo = get_repository_object(path=Path(__file__).resolve().parents[3])

print("Checking for changes under devtools/")
changed = [
    path
    for path in repo.get_changed_files("AMD", mode="all")
    if path.startswith("devtools/") and path not in exclude
]

# Capture a diff of the changes for the failure message, before reverting them.
diff = repo.diff_stream().read()

# Revert all the changes created by `node bin/bundle.js`.
repo.clean_directory(Path(repo.path) / "devtools")

doc = "https://firefox-source-docs.mozilla.org/devtools/tests/node-tests.html#devtools-bundle"

failures = {}
for path in changed:
    failures[path] = [
        {
            "path": path,
            "line": None,
            "column": None,
            "level": "error",
            "message": path
            + " is outdated and needs to be regenerated, "
            + f"instructions at: {doc}",
        }
    ]

parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
args = parser.parse_args()

with open(args.output, "w") as fp:
    json.dump(failures, fp, indent=2)

if len(failures) > 0:
    print(
        "TEST-UNEXPECTED-FAIL | devtools-bundle | DevTools bundles need to be regenerated, "
        + f"instructions at: {doc}"
    )

    print("The following devtools bundles were detected as outdated:")
    for failure in failures:
        print(failure)

    print(f"diff:{diff}")

    sys.exit(1)
