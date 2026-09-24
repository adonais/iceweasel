# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Generate New Tab's localized Fluent files for train-hopping.

New Tab packages a snapshot of translated newtab.ftl files so that a
train-hopped XPI can localize itself on Beta and Release before the strings
have ridden the trains to those channels. These files are generated into the
objdir and packaged into the XPI; they are not checked into the source tree.

Which locales are packaged is decided at configure time (see NEWTAB_XPI_LOCALES
in locales.configure) and iterated over by ../moz.build. en-US is
always packaged from the in-tree copy, so it never appears here. Every other
locale is packaged only for shipped train-hop builds, which enable
--enable-newtab-all-locales (env MOZ_BROWSER_NEWTAB_LOCALES_ALL); those locales
are copied out of a clone of the firefox-l10n repository.

`mach newtab update-locales` does the equivalent work for the manual escape-hatch
path.
"""

import json
import os
import shutil
import subprocess

import buildconfig
from fluent.syntax import parse as fluent_parse
from fluent.syntax.ast import Message, Term

FIREFOX_L10N_REPO = "https://github.com/mozilla-l10n/firefox-l10n.git"
FLUENT_SUBPATH = os.path.join("browser", "browser", "newtab", "newtab.ftl")


def _clone_dir():
    return os.path.join(
        buildconfig.topobjdir,
        "browser",
        "extensions",
        "newtab",
        "webext-glue",
        "l10n-clone",
    )


def _generated_ftl(locale):
    """Path to a locale's generated newtab.ftl in the objdir."""
    return os.path.join(
        buildconfig.topobjdir,
        "browser",
        "extensions",
        "newtab",
        "webext-glue",
        "locales",
        locale,
        "browser",
        "newtab",
        "newtab.ftl",
    )


def clone(output):
    """Clone firefox-l10n once into the objdir and write a stamp.

    Every per-locale copy_locale() output depends on this stamp, so the
    repository is fetched a single time per build rather than once per locale.
    """
    clone_dir = _clone_dir()
    if os.path.isdir(clone_dir):
        shutil.rmtree(clone_dir)
    subprocess.check_call(["git", "clone", "--depth=1", FIREFOX_L10N_REPO, clone_dir])
    output.write("ok\n")


def copy_locale(output, locale):
    """Write `locale`'s newtab.ftl from the shared clone to `output`.

    Emits an empty file when the locale has no newtab.ftl in firefox-l10n yet,
    so the declared output always exists; Fluent falls back to en-US at runtime.
    """
    source = os.path.join(_clone_dir(), locale, FLUENT_SUBPATH)
    if os.path.exists(source):
        with open(source, encoding="utf-8") as f:
            output.write(f.read())
    else:
        output.write("")


def _string_ids(ftl_path):
    with open(ftl_path, encoding="utf-8") as f:
        resource = fluent_parse(f.read())
    return {
        entry.id.name for entry in resource.body if isinstance(entry, (Message, Term))
    }


def locales_report(output, *locales):
    """Write a status report for the packaged locales: the full en-US string
    set, each locale's message IDs missing relative to en-US, and the
    firefox-l10n revision. Run `mach newtab locales-report` for the full report,
    including pending/missing status.
    """
    en_us_ftl = os.path.join(
        buildconfig.topsrcdir,
        "browser",
        "locales",
        "en-US",
        "browser",
        "newtab",
        "newtab.ftl",
    )
    en_us_ids = _string_ids(en_us_ftl)
    locale_reports = {
        locale: {"missing": sorted(en_us_ids - _string_ids(_generated_ftl(locale)))}
        for locale in locales
    }
    revision = subprocess.check_output(
        ["git", "-C", _clone_dir(), "rev-parse", "HEAD"],
        universal_newlines=True,
    ).strip()
    report = {
        "meta": {
            "repository": FIREFOX_L10N_REPO,
            "revision": revision,
        },
        "strings": sorted(en_us_ids),
        "locales": locale_reports,
    }
    json.dump(report, output, indent=2)
    output.write("\n")


def supported_locales(output, *locales):
    """Write the JSON list of locales included in the XPI.

    Consumed at runtime by AboutNewTabResourceMapping to decide which Fluent
    sources to register.
    """
    json.dump(sorted(locales), output, indent=2)
    output.write("\n")
