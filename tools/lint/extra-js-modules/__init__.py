# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import ast
import os

import mozpack.path as mozpath
from mozlint import result
from mozlint.pathutils import expand_exclusions
from mozpack.files import FileFinder
from mozversioncontrol import InvalidRepoPath, get_repository_object

DEFAULT_ALLOWLIST = "tools/lint/extra-js-modules/allowlist.txt"
MODULE_VARIABLES = {"EXTRA_JS_MODULES", "EXTRA_PP_JS_MODULES"}
# EXTRA_JS_MODULES and EXTRA_PP_JS_MODULES are aliases for the `modules`
# subdirectory of these variables.
FINAL_TARGET_VARIABLES = {"FINAL_TARGET_FILES", "FINAL_TARGET_PP_FILES"}


def module_variable(target):
    """Returns the name of the variable an assignment target installs modules
    with, or None if it doesn't install into the modules directory."""
    subdir = None
    while isinstance(target, (ast.Attribute, ast.Subscript)):
        if isinstance(target, ast.Attribute):
            subdir = target.attr
        elif isinstance(target.slice, ast.Constant):
            subdir = target.slice.value
        else:
            # We skip runtime values that cannot be analysed statically,
            # e.g. FINAL_TARGET_FILES[arch] in modules/libpref
            subdir = None
        target = target.value
    if not isinstance(target, ast.Name):
        return None

    if target.id in MODULE_VARIABLES:
        return target.id
    if target.id in FINAL_TARGET_VARIABLES and subdir == "modules":
        return f"{target.id}.modules"
    return None


def resolve_entry(mozbuild_relpath, value):
    """Returns the path a module value refers to, relative to the
    source (or, for values starting with "!", object) directory."""
    prefix = ""
    if value.startswith("!"):
        prefix = "!"
        value = value[1:]
    if value.startswith("/"):
        return prefix + mozpath.normpath(value[1:])
    return prefix + mozpath.normpath(
        mozpath.join(mozpath.dirname(mozbuild_relpath), value)
    )


def find_entries(mozbuild_path, root):
    """Yields (lineno, variable, path, error) for each module installed by a
    moz.build. If the module can't be checked, `path` is None and `error`
    explains why."""
    relpath = mozpath.relpath(mozbuild_path, root)
    with open(mozbuild_path, encoding="utf-8") as fh:
        tree = ast.parse(fh.read(), filename=mozbuild_path)

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AugAssign):
            targets = [node.target]
        else:
            continue

        for target in targets:
            variable = module_variable(target)
            if variable:
                yield from find_values(node.value, variable, relpath, root)


def find_values(value, variable, relpath, root):
    """Yields (lineno, variable, path, error) for each module in the value
    assigned to a module variable."""
    # moz.build only allows lists to be assigned to module variables, so
    # anything else is a name or expression that can't be resolved here.
    if not isinstance(value, ast.List):
        yield value.lineno, variable, None, unchecked_value_error(variable)
        return

    for elt in value.elts:
        if not isinstance(elt, ast.Constant) or not isinstance(elt.value, str):
            yield elt.lineno, variable, None, unchecked_value_error(variable)
            continue
        entry = resolve_entry(relpath, elt.value)
        if "*" in entry and not entry.startswith("!"):
            for match, _ in FileFinder(root).find(entry):
                yield elt.lineno, variable, match, None
        else:
            yield elt.lineno, variable, entry, None


def unchecked_value_error(variable):
    return f"{variable} values must be string literals in a list so they can be checked"


def read_allowlist(path):
    """Returns a dict of allowlisted paths to their line numbers."""
    allowlist = {}
    with open(path, encoding="utf-8") as fh:
        for lineno, raw_line in enumerate(fh, 1):
            line = raw_line.strip()
            if line and not line.startswith("#"):
                allowlist[line] = lineno
    return allowlist


def remove_from_allowlist(path, entries):
    with open(path, encoding="utf-8") as fh:
        lines = fh.readlines()
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.writelines(line for line in lines if line.strip() not in entries)


def all_mozbuild_files(root, config):
    """Returns every non-excluded moz.build file under root, using the VCS
    when possible since walking the whole tree is slow."""
    try:
        repo = get_repository_object(root)
    except InvalidRepoPath:
        repo = None

    if repo and os.path.samefile(repo.path, root):
        files = [
            os.path.join(root, p)
            for p, _ in repo.get_tracked_files_finder().find("**/moz.build")
        ]
    else:
        files = [root]

    # mozlint narrows `exclude` to the paths being linted, so use the linter's
    # own excludes for the whole tree.
    config = dict(config, exclude=config.get("local_exclude", config.get("exclude")))
    return {
        mozpath.normpath(p)
        for p in expand_exclusions(files, config, root)
        if os.path.basename(p) == "moz.build"
    }


def lint(paths, config, fix=None, **lintargs):
    root = lintargs["root"]
    allowlist_path = os.path.join(root, config.get("allowlist", DEFAULT_ALLOWLIST))
    allowlist = read_allowlist(allowlist_path)

    linted = {
        mozpath.normpath(p)
        for p in expand_exclusions(paths, config, root)
        if os.path.basename(p) == "moz.build"
    }

    results = []
    used = set()
    # Every moz.build is scanned, not just the linted ones, so that allowlist
    # entries that are no longer used anywhere can be reported.
    for mozbuild_path in sorted(all_mozbuild_files(root, config) | linted):
        try:
            entries = list(find_entries(mozbuild_path, root))
        except SyntaxError as e:
            if mozbuild_path not in linted:
                continue
            results.append(
                result.from_config(
                    config,
                    path=mozbuild_path,
                    lineno=e.lineno,
                    message=f"Could not parse moz.build to check modules: {e.msg}",
                )
            )
            continue
        for lineno, variable, entry, error in entries:
            if error:
                if mozbuild_path in linted:
                    results.append(
                        result.from_config(
                            config, path=mozbuild_path, lineno=lineno, message=error
                        )
                    )
                continue
            used.add(entry)
            if entry not in allowlist and mozbuild_path in linted:
                results.append(
                    result.from_config(
                        config,
                        path=mozbuild_path,
                        lineno=lineno,
                        message=f"New files may not be added to {variable}: {entry}",
                        hint="Use MOZ_SRC_FILES and load the module with a "
                        "moz-src:/// URI instead.",
                    )
                )

    stale = set(allowlist) - used
    fixed = 0
    if stale and fix:
        remove_from_allowlist(allowlist_path, stale)
        fixed = len(stale)
    elif stale:
        for entry in sorted(stale):
            results.append(
                result.from_config(
                    config,
                    path=allowlist_path,
                    lineno=allowlist[entry],
                    message=f"{entry} is no longer installed as a module and "
                    "should be removed from the allowlist",
                    hint="Run with --fix to remove it.",
                )
            )

    return {"results": results, "fixed": fixed}
