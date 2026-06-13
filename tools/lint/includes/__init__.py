# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import difflib
import os
import re

import yaml
from mozlint import result
from mozlint.pathutils import expand_exclusions

here = os.path.dirname(__file__)
with open(os.path.join(here, "..", "..", "..", "mfbt", "api.yml")) as fd:
    description = yaml.safe_load(fd)


def generate_diff(path, raw_content, line_to_delete):
    prev_content = raw_content.split("\n")
    new_content = [
        raw_line
        for lineno, raw_line in enumerate(prev_content, start=1)
        if lineno != line_to_delete
    ]
    diff = "\n".join(
        difflib.unified_diff(prev_content, new_content, fromfile=path, tofile=path)
    )
    return diff


def fix_includes(path, raw_content, line_to_delete):
    prev_content = raw_content.split("\n")
    new_content = [
        raw_line
        for lineno, raw_line in enumerate(prev_content, start=1)
        if lineno != line_to_delete
    ]
    with open(path, "w") as outfd:
        outfd.write("\n".join(new_content))


symbol_pattern = r"\b{}\b"
literal_pattern = r'[0-9."\']{}\b'

categories_pattern = {
    "variables": symbol_pattern,
    "functions": symbol_pattern,
    "macros": symbol_pattern,
    "types": symbol_pattern,
    "literals": literal_pattern,
}


def lint_mfbt_headers(results, path, raw_content, config, fix):
    supported_keys = "variables", "functions", "macros", "types", "literals"

    for header, categories in description.items():
        assert set(categories.keys()).issubset(supported_keys)

        if path.endswith(f"mfbt/{header}") or path.endswith(f"mfbt/{header[:-1]}.cpp"):
            continue

        headerline = rf'#\s*include "mozilla/{header}"'
        if not (match := re.search(headerline, raw_content)):
            continue

        content = raw_content.replace(f'"mozilla/{header}"', "")

        for category, pattern in categories_pattern.items():
            identifiers = categories.get(category, [])
            if any(
                re.search(pattern.format(identifier), content)
                for identifier in identifiers
            ):
                break
        else:
            msg = f"{path} includes {header} but does not reference any of its API"
            lineno = 1 + raw_content.count("\n", 0, match.start())

            if fix:
                fix_includes(path, raw_content, lineno)
                results["fixed"] += 1
            else:
                diff = generate_diff(path, raw_content, lineno)

                results["results"].append(
                    result.from_config(
                        config,
                        path=path,
                        message=msg,
                        level="error",
                        lineno=lineno,
                        diff=diff,
                    )
                )


def lint(paths, config, **lintargs):
    import diskarzhan

    results = {"results": [], "fixed": 0}
    paths = list(expand_exclusions(paths, config, lintargs["root"]))
    fix = lintargs.get("fix")

    for path in paths:
        try:
            with open(path) as fd:
                raw_content = fd.read()
        except UnicodeDecodeError:
            continue

        lint_mfbt_headers(results, path, raw_content, config, fix)
        diskarzhan_results = diskarzhan.diskarzhan.lint_std_headers(path, raw_content)
        diskarzhan_results += diskarzhan.diskarzhan.lint_cstd_headers(path, raw_content)
        if diskarzhan_results and fix:
            diskarzhan.diskarzhan.fix_includes(path, raw_content, diskarzhan_results)
            results["fixed"] += len(diskarzhan_results)
        else:
            for lineno, msg in diskarzhan_results:
                results["results"].append(
                    result.from_config(
                        config,
                        path=path,
                        message=msg,
                        level="error",
                        lineno=lineno,
                        diff=generate_diff(path, raw_content, lineno),
                    )
                )

    return results
