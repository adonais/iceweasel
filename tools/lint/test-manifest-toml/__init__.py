# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re
from pathlib import Path

from manifestparser import TestManifest
from manifestparser.toml import DEFAULT_SECTION, alphabetize_toml_str, sort_paths
from mozlint import result
from mozlint.pathutils import expand_exclusions
from mozpack import path as mozpath
from tomlkit.items import Array, Table

SECTION_REGEX = r"^\[.*\]$"
DISABLE_REGEX = r"^[ \t]*#[ \t]*\[.*\]"


def make_result(path, message, is_error=False):
    if is_error:
        level = "error"
    else:
        level = "warning"
    result = {
        "path": path,
        "lineno": 0,  # tomlkit does not report lineno/column
        "column": 0,
        "message": message,
        "level": level,
    }
    return result


def check_condition(results: list, config, path: Path, c: str) -> int:
    """
    Checks the condition for warnings or errors and updates results
    Returns the number of fixable warnings
    """

    fixable: int = 0
    if "verify" in c:
        return fixable  # do not warn with verify or verify-standalone
    if c.find("bits == ") >= 0:
        r = make_result(
            path,
            "using 'bits' is not idiomatic, use 'arch' instead",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("processor == ") >= 0:
        r = make_result(
            path,
            "using 'processor' is not idiomatic, use 'arch' instead",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("android_version == ") >= 0:
        r = make_result(
            path,
            "using 'android_version' is not idiomatic, use 'os_version' instead (see testing/mozbase/mozinfo/mozinfo/platforminfo.py)",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("os == 'linux'") >= 0:
        if c.find("os_version == '18.04'") >= 0:
            r = make_result(
                path,
                "linux os_version == '18.04' is no longer used",
            )
            results.append(result.from_config(config, **r))
            fixable += 1
        elif c.find("os_version == '22.04'") >= 0 and c.find("display == 'x11'") >= 0:
            r = make_result(
                path,
                "linux os_version == '22.04' is only supported on display == 'wayland'",
            )
            results.append(result.from_config(config, **r))
            fixable += 1
        elif (
            c.find("os_version == '24.04'") >= 0 and c.find("display == 'wayland'") >= 0
        ):
            r = make_result(
                path,
                "linux os_version == '24.04' is only supported on display == 'x11'",
            )
            results.append(result.from_config(config, **r))
            fixable += 1
    if c.find("os == 'mac'") >= 0:
        if c.find("os_version == '11.20'") >= 0:
            r = make_result(
                path,
                "mac os_version == '11.20' is no longer used",
            )
            results.append(result.from_config(config, **r))
            fixable += 1
    if c.find("os == 'win'") >= 0:
        if c.find("os_version == '11.2009'") >= 0:
            r = make_result(
                path,
                "win os_version == '11.2009' is no longer used",
            )
            results.append(result.from_config(config, **r))
            fixable += 1
    if c.find("apple_catalina") >= 0:
        r = make_result(
            path,
            "instead of 'apple_catalina' please use os == 'mac' && os_version == '10.15' && arch == 'x86_64'",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("apple_silicon") >= 0:
        r = make_result(
            path,
            "instead of 'apple_silicon' please use os == 'mac' && os_version == '15.30' && arch == 'aarch64'",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("win10_2009") >= 0:
        r = make_result(
            path,
            "instead of win10_2009 please use os == 'win' && os_version = '10.2009' && arch == 'x86_64'",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("win11_2009") >= 0:
        r = make_result(
            path,
            "win11_2009 is no longer used",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("!debug") >= 0:
        r = make_result(
            path,
            'instead of "!debug" use three conditions: "asan", "opt", "tsan"',
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    if c.find("== true") >= 0 or c.find("== false") >= 0:
        r = make_result(
            path,
            "use boolean variables directly instead of testing for literal values",
        )
        results.append(result.from_config(config, **r))
        fixable += 1
    return fixable


def lint(paths, config, fix=None, **lintargs):
    results = []
    fixed = 0
    topsrcdir = lintargs["root"]
    file_names = list(expand_exclusions(paths, config, topsrcdir))
    file_names = [os.path.normpath(f) for f in file_names]
    section_rx = re.compile(SECTION_REGEX, flags=re.M)
    disable_rx = re.compile(DISABLE_REGEX, flags=re.M)

    for file_name in file_names:
        path = mozpath.relpath(file_name, topsrcdir)
        if path == ".cargo/audit.toml":
            continue  # special case that cannot be excluded in yml
        parser = TestManifest(use_toml=True, document=True)

        try:
            parser.read(file_name)
        except Exception as e:
            r = make_result(path, f"The manifest is not valid TOML: {str(e)}", True)
            results.append(result.from_config(config, **r))
            continue

        manifest = parser.source_documents[file_name]
        manifest_str = open(file_name, encoding="utf-8").read()

        if not DEFAULT_SECTION in manifest:
            r = make_result(
                path, f"The manifest does not start with a [{DEFAULT_SECTION}] section."
            )
            if fix:
                fixed += 1
            results.append(result.from_config(config, **r))

        sections = [k for k in manifest.keys() if k != DEFAULT_SECTION]
        sorted_sections = sort_paths(sections)
        if sections != sorted_sections:
            r = make_result(
                path, "The manifest sections are not in alphabetical order."
            )
            if fix:
                fixed += 1
            results.append(result.from_config(config, **r))

        m = section_rx.findall(manifest_str)
        if len(m) > 0:
            for section_match in m:
                section = section_match[1:-1]
                if section == DEFAULT_SECTION:
                    continue
                if not section.startswith('"'):
                    r = make_result(
                        path, f"The section name must be double quoted: [{section}]"
                    )
                    if fix:
                        fixed += 1
                    results.append(result.from_config(config, **r))

        m = disable_rx.findall(manifest_str)
        if len(m) > 0:
            for disabled_section in m:
                r = make_result(
                    path,
                    f"Use 'disabled = \"<reason>\"' to disable a test instead of a comment: {disabled_section}",
                    True,
                )
                results.append(result.from_config(config, **r))

        for section, keyvals in manifest.body:
            if section is None:
                continue
            elif not isinstance(keyvals, Table):
                r = make_result(
                    path, f"Bad assignment in preamble: {section} = {keyvals}", True
                )
                results.append(result.from_config(config, **r))
            else:
                for k, v in keyvals.items():
                    if k.endswith("-if"):
                        if not isinstance(v, Array):
                            r = make_result(
                                path,
                                f'Value for conditional must be an array: {k} = "{v}"',
                                True,
                            )
                            results.append(result.from_config(config, **r))
                        else:
                            for e in v:
                                if e.find("||") > 0 and e.find("&&") < 0:
                                    r = make_result(
                                        path,
                                        f'Value for conditional must not include explicit ||, instead put on multiple lines: {k} = [ ... "{e}" ... ]',
                                        True,
                                    )
                                    results.append(result.from_config(config, **r))
                                else:
                                    fixable: int = check_condition(
                                        results, config, path, e
                                    )
                                    if fix:
                                        fixed += fixable

        if fix and fixed > 0:
            manifest_str = alphabetize_toml_str(manifest, True)
            fp = open(file_name, "w", encoding="utf-8", newline="\n")
            fp.write(manifest_str)
            fp.close()

    return {"results": results, "fixed": fixed}
