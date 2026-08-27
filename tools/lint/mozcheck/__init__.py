# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os
import subprocess
import sys

from mozlint import result
from mozlint.errors import LintException


def _get_source_root():
    try:
        from mozbuild.base import MozbuildObject

        obj = MozbuildObject.from_environment()
        return obj.topsrcdir, obj.topobjdir
    except Exception:
        return None, None


def _resolve_root(root):
    # `setup` and `lint` must agree on the root, or they end up looking for
    # (and building) the binary in two different target directories.
    src_root, _ = _get_source_root()
    return src_root or root


def _get_mozcheck_target_dir(root, topobjdir):
    if topobjdir:
        return os.path.join(topobjdir, "mozcheck")
    _, obj_dir = _get_source_root()
    if obj_dir:
        return os.path.join(obj_dir, "mozcheck")
    return os.path.join(root, "tools", "lint", "mozcheck", "target")


def _find_mozcheck_binary(log, root, topobjdir=None):
    exe = ".exe" if sys.platform == "win32" else ""

    # Locate or fetch the prebuilt mozcheck binary for this host, the same way
    # clang-tidy, gn, cargo-vet, etc. do (see bootstrap_path in
    # build/moz.configure/bootstrap.configure). This also covers the case
    # where a prebuilt binary is already available via MOZ_FETCHES_DIR, in CI.
    try:
        from mozbuild.bootstrap import bootstrap_toolchain

        binary = bootstrap_toolchain(f"mozcheck/mozcheck{exe}")
    except (Exception, SystemExit) as e:
        # moz.configure's `die()`, used when a toolchain can't be found or
        # fetched, raises SystemExit rather than a regular Exception.
        binary = None
        if log:
            log.warning(f"Failed to fetch prebuilt mozcheck: {e}")
    if binary:
        return binary

    target_dir = _get_mozcheck_target_dir(root, topobjdir)
    target_binary = os.path.join(target_dir, "release", "mozcheck" + exe)
    if os.path.isfile(target_binary):
        return target_binary

    crate_dir = os.path.join(root, "tools", "lint", "mozcheck")

    if log:
        log.info("Building mozcheck from source...")
    try:
        subprocess.run(
            ["cargo", "build", "--release", "--target-dir", target_dir],
            cwd=crate_dir,
            check=True,
            capture_output=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        if log:
            log.error(f"Failed to build mozcheck: {e}")
        return None

    if os.path.isfile(target_binary):
        return target_binary

    return None


def setup(root, **lintargs):
    # Resolve the binary once, here in the parent process, rather than letting
    # every mozlint worker race to fetch or build it (bug 2058685).
    log = lintargs.get("log")
    _find_mozcheck_binary(log, _resolve_root(root), lintargs.get("topobjdir"))


def lint(paths, config, fix=None, **lintargs):
    log = lintargs["log"]
    root = _resolve_root(lintargs["root"])
    binary = _find_mozcheck_binary(log, root, lintargs.get("topobjdir"))
    if not binary:
        raise LintException(
            "mozcheck binary is unavailable: could not locate a prebuilt "
            "binary (MOZ_FETCHES_DIR/mozcheck) and the source build failed. "
            "Ensure the linter task fetches the relevant mozcheck toolchain, "
            "or that cargo is available locally."
        )

    check = config.get("check", config["name"])

    batch_input = json.dumps({
        "root": root,
        "fix": fix or lintargs.get("fix", False),
        "linters": [
            {
                "name": config["name"],
                "check": check,
                "paths": list(paths),
                "extensions": config.get("extensions", []),
                "exclude": config.get("exclude", []),
                "find_dotfiles": config.get("find-dotfiles", False),
                "config": {
                    **config.get("check-config", {}),
                    "message": config["description"],
                },
            }
        ],
    })

    proc = subprocess.run(
        [binary, "batch"],
        check=False,
        input=batch_input,
        capture_output=True,
        text=True,
    )

    if proc.returncode != 0 and proc.stderr:
        log.warning(
            f"mozcheck exited with code {proc.returncode}: {proc.stderr.strip()}"
        )

    results = []
    fixed = 0
    for raw_line in proc.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        if "fixed" in data and "path" not in data:
            fixed += data["fixed"]
            continue

        res = {
            "path": data["path"],
            "message": data.get("message", ""),
            "level": data.get("level", "error"),
        }
        if data.get("lineno"):
            res["lineno"] = data["lineno"]
        if data.get("column"):
            res["column"] = data["column"]
        if data.get("rule"):
            res["rule"] = data["rule"]
        results.append(result.from_config(config, **res))

    return {"results": results, "fixed": fixed}
