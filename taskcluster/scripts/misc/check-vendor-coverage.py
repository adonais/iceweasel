# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Check every vendored moz.yaml is verified by a vendor-verify task.

Turns the tree orange if a vendored moz.yaml (has a `vendoring:` section,
non-rust) is not in any task's `members` in vendor-verify.yml -- so a newly added
vendored library can't silently escape the re-vendoring checks. Also flags stale
entries, in `members` or in the expected-fail annotations, whose moz.yaml no longer
exists or is no longer vendored. Run as a source-test task gated on moz.yaml
+ config changes.
"""

import os
import sys

import yaml

TASKS = "taskcluster/kinds/source-test/vendor-verify.yml"
EXPECTED_FAIL = "taskcluster/scripts/misc/vendor-verify-expected-fail.yml"


def vendored_moz_yamls():
    found = set()
    for dirpath, dirnames, filenames in os.walk("."):
        dirnames[:] = [
            d
            for d in dirnames
            if d not in (".hg", ".git", "node_modules", "__pycache__")
            and not d.startswith("obj-")
        ]
        if "moz.yaml" not in filenames:
            continue
        path = os.path.join(dirpath, "moz.yaml").replace("./", "", 1)
        if path in SKIP_LIST_NOT_A_VENDORED_LIBRARY:
            continue
        try:
            with open(path) as fh:
                data = yaml.safe_load(fh) or {}
        except Exception:
            continue
        vendoring = data.get("vendoring") or {}
        # rust flavor is covered by the separate `rust` vendoring task.
        if vendoring and vendoring.get("flavor") != "rust":
            found.add(path)
    return found


def main():
    with open(TASKS) as fh:
        # Every top-level key in a `tasks-from` file is a task, except the defaults.
        tasks = yaml.safe_load(fh) or {}
    tasks.pop("task-defaults", None)
    with open(EXPECTED_FAIL) as fh:
        annotations = (yaml.safe_load(fh) or {}).get("expected-fail") or {}

    verified = {m for task in tasks.values() for m in (task.get("members") or [])}
    annotated = set(annotations)
    vendored = vendored_moz_yamls()

    unassigned = sorted(vendored - verified)
    stale_member = sorted(verified - vendored)
    stale_expected_fail = sorted(annotated - vendored)

    for path in unassigned:
        print(
            f"TEST-UNEXPECTED-ERROR | {path} | this vendored library (its moz.yaml has "
            f"a `vendoring:` section) is not in any task's `members` in {TASKS}, so its "
            f"vendoring would not be verified. Add `{path}` to one of them -- any task "
            "works; it only picks which job verifies it, so put it with related "
            f"libraries. See the header of {TASKS}. (vendoring-coverage)"
        )
    for path in stale_member:
        print(
            f"TEST-UNEXPECTED-ERROR | {TASKS} | a task's `members` lists `{path}`, which "
            "is no longer a vendored moz.yaml (it was removed, or its "
            f"`vendoring:` section was). Delete that entry from {TASKS}. "
            "(vendoring-coverage)"
        )
    for path in stale_expected_fail:
        print(
            f"TEST-UNEXPECTED-ERROR | {EXPECTED_FAIL} | `expected-fail` references "
            f"`{path}`, which is not a vendored moz.yaml -- likely a typo or a "
            f"removed library. Fix or delete that entry in {EXPECTED_FAIL}. "
            "(vendoring-coverage)"
        )

    if unassigned or stale_member or stale_expected_fail:
        print(
            f"vendor-verify coverage FAILED: {len(unassigned)} unassigned, "
            f"{len(stale_member)} stale `members` entries, "
            f"{len(stale_expected_fail)} stale expected-fail entries."
        )
        sys.exit(1)
    print(
        f"vendor-verify coverage OK: all {len(vendored)} vendored "
        "moz.yaml are verified by a task, and every expected-fail entry is valid."
    )


##############################################################################
#                                                                            #
#                            DO NOT ADD TO THIS LIST.                        #
#                                                                            #
#  This is not a way to make a vendor-verify failure go away. A library only #
#  belongs here if the check cannot be run against it at all -- not if it    #
#  runs and fails, however inconvenient the failure is.                      #
#                                                                            #
#  If a library fails to re-vendor, fix the library. If it genuinely cannot  #
#  be fixed yet, annotate it in vendor-verify-expected-fail.yml against a    #
#  filed bug: that keeps running the check, keeps the job green, and turns   #
#  the tree orange the day the library starts reproducing again so the       #
#  annotation gets removed.                                                  #
#                                                                            #
#  An entry HERE is different in kind. The library leaves the job's universe #
#  entirely. Nothing runs, nothing reports, and nobody finds out when it     #
#  breaks or when it starts working -- which is the whole thing this job     #
#  exists to prevent. Every library in the tree is one line away from that.  #
#                                                                            #
#  So: fix it, or annotate it. Adding a line below needs a taskgraph peer    #
#  and the module owner of whatever you are exempting to agree that the      #
#  check cannot meaningfully be run.                                         #
#                                                                            #
##############################################################################
SKIP_LIST_NOT_A_VENDORED_LIBRARY = {
    # DO NOT ADD AN ENTRY HERE. Fix the library, or annotate it in
    # vendor-verify-expected-fail.yml against a filed bug. Read the comment above.
    "mobile/android/android-components/plugins/dependencies/src/main/java/moz.yaml": (
        "bug 2067205: this one drives updatebot version bumps of ApplicationServices.kt "
        "rather than vendoring sources. It skips every vendoring step, so there is "
        "nothing to reproduce, and its one update-action moves the version forward to "
        "the newest app-services build -- so running the check does not sit still, it "
        "fails. On beta the script raises NotImplementedError, because app-services is "
        "on the release channel there and it only handles nightly. On central it "
        "rewrites ApplicationServices.kt whenever a newer app-services build exists, "
        "which reports as drift. An expected-fail annotation cannot express that "
        "either: on central it passes whenever nothing has moved, so the annotation "
        "would go UNEXPECTED-PASS and turn the tree orange on its own."
    ),
    # DO NOT ADD AN ENTRY HERE EITHER. Whatever you were about to exempt, the answer
    # is a fix, or an expected-fail annotation with a bug. Read the comment above the
    # list.
}


if __name__ == "__main__":
    main()
