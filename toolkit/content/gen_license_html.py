# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Render about:license from the LICENSES declarations collected tree-wide.

The build backend writes every LICENSES entry reachable in this configuration
to <objdir>/licenses.json; this turns that into HTML. Because an unconfigured
directory is never traversed, a license only appears in builds that ship the
code it covers, which is what the old per-entry #ifdefs did by hand.
"""

import html
import json
import os
import re

from mako.template import Template

# MPL and the LGPLs head the list: they cover the bulk of the product rather
# than one vendored library, and about:license has always led with them.
PINNED = ("mpl", "lgpl", "lgpl-3.0")


def sort_key(license):
    try:
        return (0, PINNED.index(license["id"]), "")
    except ValueError:
        return (1, 0, license["title"].lower())


# The blocks an application splices into the page, in the order they are passed
# as extra inputs. These were #includesubst of a path held in a per-directory
# DEFINE, so they cannot come from the global config: browser/base substitutes
# APP_LICENSE_BLOCK and overrides chrome://global/content/license.html with the
# result, which is the about:license Firefox actually ships.
APP_BLOCKS = (
    "app_license_block",
    "app_license_list_block",
    "app_license_body_block",
    "app_license_product_name",
)


# Whitespace and markup at the very end of a notice, so the colon that matters
# is found whether the notice closes its last tag or not.
TRAILING_MARKUP = re.compile(r"(?:\s|<[^<>]*>)*$")


def leads_paths(notice):
    """Whether a notice already introduces the coverage list itself.

    A notice trailing off in a colon ("This license applies to the files:") is
    the heading for the list that follows, so the template must not add a
    second one of its own in front of it.
    """
    return TRAILING_MARKUP.sub("", notice).endswith(":")


def read_blocks(paths):
    blocks = dict.fromkeys(APP_BLOCKS, "")
    for name, path in zip(APP_BLOCKS, paths):
        with open(path, encoding="utf-8") as fh:
            blocks[name] = fh.read()
    if bool(blocks["app_license_list_block"]) != bool(blocks["app_license_body_block"]):
        raise Exception(
            "APP_LICENSE_LIST_BLOCK and APP_LICENSE_BODY_BLOCK go together."
        )
    return blocks


def render(template_path, licenses, substs, blocks=None):
    """Render about:license.

    Kept free of buildconfig, which is an objdir module, so `mach vendor
    licenses` can call it with the substs it already holds.
    """
    for license in licenses:
        if not license.get("html"):
            license["text"] = html.escape(license["text"], quote=False)
        license["notice_leads_paths"] = leads_paths(license.get("notice") or "")

    return Template(filename=template_path, output_encoding=None).render(
        licenses=sorted(licenses, key=sort_key),
        config=substs,
        **(blocks or dict.fromkeys(APP_BLOCKS, "")),
    )


def main(output, template_path, licenses_path, *app_block_paths):
    import buildconfig

    with open(licenses_path, encoding="utf-8") as fh:
        licenses = json.load(fh)["licenses"]

    # An artifact build does not traverse the directories only a compiling
    # build does, so it takes their records from the build its binaries came
    # from, as installed by `mach artifact install`.
    deps = {template_path, licenses_path, *app_block_paths}
    if buildconfig.substs.get("MOZ_ARTIFACT_BUILDS"):
        compiled_path = os.path.join(
            buildconfig.topobjdir, "dist", "licenses.artifact.json"
        )
        deps.add(compiled_path)
        if os.path.exists(compiled_path):
            with open(compiled_path, encoding="utf-8") as fh:
                compiled = {l["id"]: l for l in json.load(fh)["licenses"]}
            for license in licenses:
                extra = compiled.pop(license["id"], {}).get("paths", [])
                license["paths"] = sorted(set(license["paths"]) | set(extra))
            licenses += compiled.values()

    output.write(
        render(
            template_path,
            licenses,
            buildconfig.substs,
            read_blocks(app_block_paths),
        )
    )
    return deps
