# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import ast
import glob
import os

import mozpack.path as mozpath
from mozlint import result
from mozlint.pathutils import expand_exclusions

topsrcdir = mozpath.dirname(mozpath.dirname(mozpath.dirname(mozpath.dirname(__file__))))

HEADER_EXTENSIONS = (".h", ".hpp", ".hh")


class SourceCollector(ast.NodeVisitor):
    """
    Collect all referenced string literal that looks like a header files
    """

    def __init__(self, dirname):
        self.dirname = dirname
        self.source_headers = set()

    def visit_Constant(self, node):
        if not isinstance(node.value, str):
            return
        if not os.path.exists(mozpath.join(self.dirname, node.value)):
            return
        if node.value.endswith(HEADER_EXTENSIONS):
            self.source_headers.add(node.value)


def check_source_headers(moz_build):

    try:
        with open(moz_build, encoding="utf-8") as fd:
            raw_content = fd.read()
    except UnicodeDecodeError:
        return []

    tree = ast.parse(raw_content, filename=moz_build)

    dirname = mozpath.dirname(moz_build)

    # Make sure all source_headers are referenced. The algorithm is a bit
    # stupid, and does not handle runtime computation of header names, which
    # fortunately occurs scarcely.

    # 1. collect all literal in the moz.build that looks like a header
    collect_sources = SourceCollector(dirname)
    collect_sources.visit(tree)

    # 2. list all headers in moz.build's directory
    source_headers = {
        mozpath.basename(hdr)
        for hdr_ext in HEADER_EXTENSIONS
        for hdr in glob.glob(mozpath.join(dirname, f"*{hdr_ext}"))
    }

    # 3. make sure every header from 2. appears in 1.
    missing_header_references = source_headers - collect_sources.source_headers
    missing_header_references = sorted(missing_header_references)

    pretty_dirname = mozpath.relpath(dirname, topsrcdir) + "/"
    pretty_moz_build = mozpath.relpath(moz_build, topsrcdir)

    results = [
        f"{hdr} found in {pretty_dirname} but not referenced in {pretty_moz_build}"
        for hdr in missing_header_references
    ]
    return results


def lint(paths, config, **lintargs):
    results = {"results": [], "fixed": 0}
    paths = list(expand_exclusions(paths, config, lintargs["root"]))

    # Need an extra round  of exclusion because we exclude moz.build and not their individual
    # headers, so if a header is passed and the associated moz.build is
    # excluded, just skip
    excluded = {
        mozpath.join(lintargs["root"], p)
        for p in (*config.get("exclude", ()), *config.get("local_exclude", ()))
    }

    visited_directories = set()

    for path in paths:
        visited_directory = mozpath.dirname(path)
        if visited_directory in visited_directories:
            continue
        visited_directories.add(visited_directory)

        moz_build = mozpath.join(visited_directory, "moz.build")
        if not os.path.exists(moz_build):
            continue

        if moz_build in excluded:
            continue

        all_results = check_source_headers(moz_build)
        for msg in all_results:
            results["results"].append(
                result.from_config(
                    config,
                    path=moz_build,
                    message=msg,
                    level="error",
                )
            )

    return results
