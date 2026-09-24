#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Build a prefilled Bugzilla enter_bug.cgi URL for a good-first-bug.

There is no MCP tool to create Bugzilla bugs: the user submits each bug by
clicking the generated URL.
"""

import argparse
import configparser
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlencode

BUGZILLA = "https://bugzilla.mozilla.org"
BUGZILLA_HOST = "bugzilla.mozilla.org"

# python-bugzilla's own search order, hardcoded on every platform.
BUGZILLARC_PATHS = (
    "/etc/bugzillarc",
    "~/.bugzillarc",
    "~/.config/python-bugzilla/bugzillarc",
)


ASK = (
    "Ask the filer for their Bugzilla account email, which "
    f"{BUGZILLA}/userprefs.cgi shows, and pass it with --mentor. Never "
    "substitute another address for it."
)


def resolve_mentor():
    """The filer's Bugzilla account email, from their API key.

    Never replace this with an address from elsewhere: a Bugzilla account
    often uses one of its own (a `+bmo` alias is common).
    """
    config = configparser.ConfigParser()
    try:
        config.read([os.path.expanduser(path) for path in BUGZILLARC_PATHS])
    except configparser.Error as error:
        raise SystemExit(f"Unreadable bugzillarc ({error}). {ASK}")
    # Only a key the file ties to this host: a bugzillarc commonly describes
    # some other Bugzilla, and [DEFAULT] alone does not say which.
    if not config.has_option(BUGZILLA_HOST, "api_key"):
        raise SystemExit(
            "No Bugzilla API key for "
            + BUGZILLA_HOST
            + " in "
            + ", ".join(BUGZILLARC_PATHS)
            + f". {ASK}"
        )
    key = config.get(BUGZILLA_HOST, "api_key")
    request = urllib.request.Request(
        f"{BUGZILLA}/rest/whoami", headers={"X-BUGZILLA-API-KEY": key}
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)["name"]
    except urllib.error.URLError as error:
        raise SystemExit(
            f"Could not read the account behind the API key ({error}). {ASK}"
        )


def build_url(
    title,
    comment,
    *,
    product="Developer Infrastructure",
    component="Lint and Formatting",
    tracker=None,
    keywords="good-first-bug",
    lang=None,
    mentor=None,
):
    params = {
        "product": product,
        "component": component,
        "short_desc": title,
        "comment": comment,
        "keywords": keywords,
        "bug_type": "task",
        "version": "unspecified",
        "rep_platform": "All",
        "op_sys": "All",
    }
    if tracker:
        params["blocked"] = tracker
    if lang:
        params["status_whiteboard"] = f"[lang={lang}]"
    if mentor:
        params["bug_mentors"] = mentor
    return "https://bugzilla.mozilla.org/enter_bug.cgi?" + urlencode(params)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("title")
    parser.add_argument("comment")
    parser.add_argument("--product", default="Developer Infrastructure")
    parser.add_argument("--component", default="Lint and Formatting")
    parser.add_argument("--tracker")
    parser.add_argument("--keywords", default="good-first-bug")
    parser.add_argument("--lang")
    parser.add_argument(
        "--mentor",
        help="Bugzilla account email of the mentor, for the bug_mentors field. "
        "Defaults to the owner of the API key in the bugzillarc.",
    )
    args = parser.parse_args(argv)
    mentor = args.mentor if args.mentor is not None else resolve_mentor()
    print(
        build_url(
            args.title,
            args.comment,
            product=args.product,
            component=args.component,
            tracker=args.tracker,
            keywords=args.keywords,
            lang=args.lang,
            mentor=mentor,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
