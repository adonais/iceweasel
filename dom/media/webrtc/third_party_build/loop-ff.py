# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import atexit
import datetime
import os
import subprocess
import sys

from fast_forward_libwebrtc import (
    FastForwardError,
    fast_forward_libwebrtc,
    find_base_commit,
    find_next_commit,
)
from filter_git_changes import filter_git_changes
from run_operations import (
    ErrorHelp,
    RepoType,
    detect_repo_type,
    get_last_line,
    git_status,
    run_git,
    run_hg,
    run_shell,
)
from save_patch_stack import save_patch_stack

# This script drives the libwebrtc fast-forward process one upstream commit
# at a time.  It is the Python port of loop-ff.sh and expects to be invoked
# with a fully-prepared environment (see loop-ff.sh, which sources
# use_config_env.sh before calling this script).

script_name = os.path.basename(__file__)
error_help = ErrorHelp()
error_help.set_prefix(
    f"===loop-ff=== *** ERROR *** {script_name} did not complete successfully!"
)

# If DEBUG_LOOP_FF is set, echo commands run via run_command before executing.
DEBUG = os.environ.get("DEBUG_LOOP_FF", "") != ""


def early_exit_handler():
    error_help.print_help()


def echo_log(msg):
    print(f"===loop-ff=== {msg}")


def run_command(cmd, shell=False, extra_env=None, ignore_errors=False):
    # Run a command, letting its stdout/stderr flow through to our own so that
    # the loop-ff.sh wrapper captures everything in the log file.
    display = cmd if isinstance(cmd, str) else " ".join(cmd)
    if DEBUG:
        print(f"+ {display}")

    run_env = None
    if extra_env is not None:
        run_env = os.environ.copy()
        run_env.update(extra_env)

    run_kwargs = {"env": run_env}
    if shell:
        run_kwargs["shell"] = True
        run_kwargs["executable"] = "/bin/bash"

    # Flush first so our output stays ordered ahead of the child's output.
    sys.stdout.flush()
    res = subprocess.run(cmd, check=False, **run_kwargs)
    if res.returncode != 0 and not ignore_errors:
        caller_line = sys._getframe(1).f_lineno
        echo_log(
            f"Hit return code {res.returncode} at {script_name} line "
            f"{caller_line}. Aborting."
        )
        sys.exit(res.returncode)
    return res.returncode


def clean_exit(code=0):
    # Unregister the error help handler so a normal/early exit doesn't
    # falsely report as an error, then exit.
    atexit.unregister(early_exit_handler)
    sys.exit(code)


def count_moz_changed(is_git):
    # Count the files changed in the newest local vendor commit, ignoring the
    # README.mozilla bookkeeping files (and hg's '# files changed,' summary).
    if is_git:
        lines = run_git("git show --format= --name-status", ".")
    else:
        lines = run_hg("hg diff -c tip --stat")
        lines = [line for line in lines if "files changed," not in line]
    return len([line for line in lines if "README.mozilla" not in line])


def main():
    script_dir = os.environ["SCRIPT_DIR"]
    state_dir = os.environ["STATE_DIR"]
    log_dir = os.environ["LOG_DIR"]
    tmp_dir = os.environ["TMP_DIR"]

    libwebrtc_src = os.environ.get("MOZ_LIBWEBRTC_SRC", "")
    libwebrtc_branch = os.environ.get("MOZ_LIBWEBRTC_BRANCH", "")
    target = os.environ.get("MOZ_TARGET_UPSTREAM_BRANCH_HEAD", "")
    fastforward_bug = os.environ.get("MOZ_FASTFORWARD_BUG", "")
    stop_after_commit = os.environ.get("MOZ_STOP_AFTER_COMMIT", "")
    advance_one_commit = os.environ.get("MOZ_ADVANCE_ONE_COMMIT", "")

    if libwebrtc_src == "":
        print("MOZ_LIBWEBRTC_SRC is not defined, see README.md")
        sys.exit(0)
    if not os.path.isdir(libwebrtc_src):
        print(f"Path {libwebrtc_src} is not found, see README.md")
        sys.exit(0)
    if libwebrtc_branch == "":
        print("MOZ_LIBWEBRTC_BRANCH is not defined, see README.md")
        sys.exit(0)

    if stop_after_commit == "":
        stdout_lines = run_git(
            f"git show {target} --format=%h --name-only", libwebrtc_src
        )
        stop_after_commit = stdout_lines[0]
        print(f"No MOZ_STOP_AFTER_COMMIT variable defined - stopping at {target}")

    repo_type = detect_repo_type()
    is_git = repo_type == RepoType.GIT
    print(f"repo type: {'git' if is_git else 'hg'}")

    # Print an error message (and any current error help) if a command
    # fails and causes the script to exit.
    atexit.register(early_exit_handler)

    # make sure third_party/libwebrtc/README.mozilla.last-vendor is the committed
    # version so we properly determine the base and next-base commits in the loop
    # below
    if is_git:
        run_git("git restore third_party/libwebrtc/README.mozilla.last-vendor", ".")
    else:
        run_hg("hg revert -C third_party/libwebrtc/README.mozilla.last-vendor")

    # check for a resume situation from fast_forward_libwebrtc.py
    resume_file = os.path.join(state_dir, "fast_forward.resume")
    resume = ""
    if os.path.exists(resume_file):
        resume = get_last_line(resume_file)

    # check for the situation where we've encountered an error when running
    # detect_upstream_revert.sh and should skip running it a second time.
    skip_revert_file = os.path.join(state_dir, "loop.skip-revert-detect")
    skip_next_revert_chk = ""
    if os.path.exists(skip_revert_file):
        skip_next_revert_chk = get_last_line(skip_revert_file)
    print(f"SKIP_NEXT_REVERT_CHK: '{skip_next_revert_chk}'")

    error_help.set_help(
        f"""
It appears that verification of initial vendoring from our local copy
of the moz-libwebrtc git repo containing our patch-stack has failed.
- If you have never previously run the fast-forward (loop-ff.sh) script,
  you may need to prepare the github repository by running prep_repo.sh.
- If you have previously run loop-ff.sh successfully, there may be a new
  change to third_party/libwebrtc that should be extracted from mercurial
  and added to the patch stack in github.  It may be as easy as running:
      ./mach python {script_dir}/extract-for-git.py tip::tip
      mv mailbox.patch {libwebrtc_src}
      (cd {libwebrtc_src} && \\
       git am mailbox.patch)

To verify vendoring, run:
    bash {script_dir}/verify_vendoring.sh

When verify_vendoring.sh is successful, please run the following command
in bash:
    (source {script_dir}/use_config_env.sh ; \\
     ./mach python {script_dir}/save_patch_stack.py \\
      --repo-path {libwebrtc_src} \\
      --target-branch-head {target} )

You may resume running this script with the following command:
    bash {script_dir}/loop-ff.sh
"""
    )
    # if we're not in the resume situation from fast_forward_libwebrtc.py
    if resume == "":
        # start off by verifying the vendoring process to make sure no changes
        # have been added to elm to fix bugs.
        echo_log("Verifying vendoring...")
        # The script outputs its own error message when verifying fails, so
        # capture that output of verify_vendoring.sh quietly.
        with open(os.path.join(log_dir, "log-verify.txt"), "w") as logf:
            res = subprocess.run(
                ["bash", f"{script_dir}/verify_vendoring.sh"],
                stdout=logf,
                stderr=subprocess.STDOUT,
                text=True,
                check=False,
            )
        if res.returncode != 0:
            sys.exit(res.returncode)
        echo_log("Done verifying vendoring.")
    error_help.set_help(None)

    while True:
        try:
            base = find_base_commit(libwebrtc_src, target)
            next_base = find_next_commit(libwebrtc_src, target)
        except FastForwardError as e:
            error_help.set_help(str(e))
            sys.exit(1)

        if base == next_base:
            echo_log(f"Processing complete, already at upstream {base}")
            clean_exit(0)

        echo_log("===================")

        commits_remaining = len(
            run_git(f"git log --oneline {base}..{target}", libwebrtc_src)
        )
        echo_log(f"Commits remaining: {commits_remaining}")

        print(
            f"Before revert detection, SKIP_NEXT_REVERT_CHK: '{skip_next_revert_chk}'"
        )
        print(f"Before revert detection, RESUME: '{resume}'")

        if is_git:
            cleanup_cmds = (
                "git restore --staged third_party/libwebrtc && "
                "git restore third_party/libwebrtc && "
                "git clean -f third_party/libwebrtc"
            )
        else:
            cleanup_cmds = (
                "hg revert third_party/libwebrtc && hg purge third_party/libwebrtc"
            )
        error_help.set_help(
            f"""Some portion of the detection and/or fixing of upstream revert commits
has failed.  This is usually a result of too many changes in the same file
between the original commit and the upstream revert commit.  There are two
common ways forward:
  1: Fix the state of the libwebrtc repo so that it matches the expected
     patch stack.  For more information what to expect for the patch stack,
     please see https://searchfox.org/firefox-main/rev/9233846aa396b6974783199e1bfe3a38473fc518/dom/media/webrtc/third_party_build/make_upstream_revert_noop.sh#3-21
     The libwebrtc repo is here: {libwebrtc_src}
  2: Run the following commands to revert the state of the libwebrtc repo
     and temporarily disable the upstream revert commit processing:
     {cleanup_cmds} ; \\
     (source dom/media/webrtc/third_party_build/use_config_env.sh ; \\
      rm $STATE_DIR/*.resume ; \\
      ./mach python $SCRIPT_DIR/restore_patch_stack.py \\
                    --repo-path $MOZ_LIBWEBRTC_SRC && \\
      MOZ_ADVANCE_ONE_COMMIT=1 SKIP_NEXT_REVERT_CHK=1 bash $SCRIPT_DIR/loop-ff.sh \\
     )
When fixed, please resume this script with the following command:
    bash {script_dir}/loop-ff.sh
"""
        )
        if skip_next_revert_chk == "" and resume == "":
            echo_log("Check for upcoming revert commit")
            with open(skip_revert_file, "w") as ofile:
                ofile.write("true\n")
            run_command(
                ["bash", f"{script_dir}/detect_upstream_revert.sh"],
                extra_env={"AUTO_FIX_REVERT_AS_NOOP": "1"},
            )
        with open(skip_revert_file, "w") as ofile:
            ofile.write("\n")
        error_help.set_help(None)

        noop_commit_path = os.path.join(state_dir, f"{next_base}.no-op-cherry-pick-msg")
        echo_log(f"Looking for {noop_commit_path}")
        handle_noop_commit = os.path.exists(noop_commit_path)
        if handle_noop_commit:
            echo_log("Detected special commit msg, setting HANDLE_NOOP_COMMIT=1")

        echo_log(f"Moving from moz-libwebrtc commit {base} to {next_base}")
        fast_forward_libwebrtc(
            "third_party/libwebrtc",
            state_dir,
            log_dir,
            tmp_dir,
            script_dir,
            libwebrtc_src,
            libwebrtc_branch,
            int(fastforward_bug),
            target,
        )

        moz_changed = count_moz_changed(is_git)
        git_changed = len(filter_git_changes(libwebrtc_src, next_base, None))

        echo_log(
            f"Verify number of files changed MOZ({moz_changed}) GIT({git_changed})"
        )
        if handle_noop_commit:
            echo_log("NO-OP commit detected, we expect file changed counts to differ")
        elif moz_changed != git_changed:
            echo_log(
                f"MOZ_CHANGED {moz_changed} should equal GIT_CHANGED {git_changed}"
            )
            print(
                f"""
The number of files changed in the upstream commit ({git_changed}) does
not match the number of files changed in the local Mozilla repo
commit ({moz_changed}).  This may indicate a mismatch between the vendoring
script and this script, or it could be a true error in the import
processing.  Once the issue has been resolved, the following steps
remain for this commit:
  # save the patch-stack
  ./mach python {script_dir}/save_patch_stack.py \\
    --skip-startup-sanity \\
    --repo-path {libwebrtc_src} \\
    --branch {libwebrtc_branch} \\
    --patch-path "third_party/libwebrtc/moz-patch-stack" \\
    --state-path {state_dir} \\
    --target-branch-head {target}
  # generate moz.build files (may not be necessary)
  ./mach python build/gn_processor.py \\
      {script_dir}/gn-configs/webrtc.json
  # commit the updated moz.build files with the appropriate commit msg
  bash {script_dir}/commit-build-file-changes.sh
  # do a (hopefully) quick test build
  ./mach build && ./mach build recurse_gtest && echo "Successful build"

After a successful build, you may resume this script:
    bash {script_dir}/loop-ff.sh
"""
            )
            clean_exit(1)

        # save the current patch stack in case we need to reconstitute it later
        echo_log("Save patch-stack")
        save_patch_stack(
            libwebrtc_src,
            libwebrtc_branch,
            os.path.abspath("third_party/libwebrtc/moz-patch-stack"),
            state_dir,
            target,
            None,
            False,
        )

        modified_build_related_file_cnt = len(
            run_shell(f"bash {script_dir}/get_build_file_changes.sh")
        )
        error_help.set_help(
            f"""
Generating build files has failed.  This likely means changes to one or more
BUILD.gn files are required.  Commit those changes following the instructions
in https://wiki.mozilla.org/Media/WebRTC/libwebrtc_Update_Process#Operational_notes
Then complete these steps:
  # generate moz.build files (may not be necessary)
  ./mach python build/gn_processor.py \\
      {script_dir}/gn-configs/webrtc.json
  # commit the updated moz.build files with the appropriate commit msg
  bash {script_dir}/commit-build-file-changes.sh
  # do a (hopefully) quick test build
  ./mach build && ./mach build recurse_gtest && echo "Successful build"

After a successful build, you may resume this script:
    bash {script_dir}/loop-ff.sh
"""
        )
        echo_log(
            f"Modified .gn, **/BUILD.gn, or **/*.gni files: "
            f"{modified_build_related_file_cnt}"
        )
        moz_build_change_cnt = 0
        if modified_build_related_file_cnt != 0:
            echo_log("Regenerate build files")
            run_command([
                "./mach",
                "python",
                "build/gn_processor.py",
                f"{script_dir}/gn-configs/webrtc.json",
            ])

            if is_git:
                moz_build_change_cnt = len(
                    git_status(".", "third_party/libwebrtc/**moz.build")
                )
            else:
                moz_build_change_cnt = len(
                    run_hg(
                        "hg status third_party/libwebrtc "
                        "--include third_party/libwebrtc/**moz.build"
                    )
                )
            if moz_build_change_cnt != 0:
                echo_log("Detected modified moz.build files, committing")
                run_command(["bash", f"{script_dir}/commit-build-file-changes.sh"])
        error_help.set_help(None)

        error_help.set_help(
            f"""
The test build has failed.  Most likely this is due to an upstream api
change that must be reflected in Mozilla code outside of the
third_party/libwebrtc directory. After fixing the build, you may resume
running this script with the following command:
    ./mach build && ./mach build recurse_gtest && \\
    bash {script_dir}/loop-ff.sh
"""
        )
        echo_log("Test build - ./mach build")
        run_command(["./mach", "build"])
        echo_log("Test build - ./mach build recurse_gtest")
        run_command(["./mach", "build", "recurse_gtest"])
        error_help.set_help(None)

        # If we've committed moz.build changes, spin up try builds.
        if moz_build_change_cnt != 0:
            try_fuzzy_query_string = "^build-"
            push_to_vcs = "" if is_git else "--push-to-vcs"
            current_time = datetime.datetime.now().ctime()
            echo_log("Detected modified moz.build files, starting try builds with")
            echo_log(f"'{try_fuzzy_query_string}' at {current_time}")
            echo_log(
                "This try push is started to help earlier detection of build issues"
            )
            echo_log("across different platforms supported by Mozilla.")
            echo_log(
                "Note - this step can take a long time (occasionally in the 10min range)"
            )
            echo_log("       with little or no feedback.")
            # Show the time used for this command, and don't let it fail if the
            # command times out so the script continues running.  This command
            # can take quite long, occasionally 10min.
            run_command(
                f"time ./mach try fuzzy {push_to_vcs} --full -q {try_fuzzy_query_string}",
                shell=True,
                ignore_errors=True,
            )

        if stop_after_commit != "":
            if next_base == stop_after_commit:
                break

        if advance_one_commit != "":
            echo_log("Done advancing one commit.")
            clean_exit(0)

        # successfully completed one iteration through the loop, so we can reset
        # resume
        resume = ""

    echo_log(f"Completed fast-forward to {stop_after_commit}")
    atexit.unregister(early_exit_handler)


if __name__ == "__main__":
    main()
