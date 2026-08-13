# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Helpers for resolving webextensions to install into the test profile."""

import os

import requests

AMO_API_ADDON_URL = "https://addons.mozilla.org/api/v5/addons/addon/{addon_id}/"


class AddonResolutionError(Exception):
    """Raised when an addon GUID/slug cannot be resolved to a download URL."""


def is_url(entry):
    return entry.startswith("http://") or entry.startswith("https://")


def is_local_path(entry):
    return entry.endswith(".xpi") and os.path.exists(entry)


def resolve_amo_addon(addon_id):
    """Resolve an AMO addon GUID/slug to its current pinned .xpi download URL.

    :param addon_id str: An addon GUID (e.g. ``uBlock0@raymondhill.net``) or slug.
    :return str: The download URL of the addon's current version.
    """
    api_url = AMO_API_ADDON_URL.format(addon_id=addon_id)
    try:
        resp = requests.get(api_url, headers={"User-Agent": "raptor"}, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise AddonResolutionError(
            f"Could not resolve addon {addon_id!r} from AMO ({api_url}): {e}"
        )

    current_version = data.get("current_version") or {}
    # AMO API v5 exposes a single `file`; older shapes used a `files` list.
    addon_file = current_version.get("file")
    if addon_file is None:
        files = current_version.get("files") or []
        addon_file = files[0] if files else None

    if not addon_file or not addon_file.get("url"):
        raise AddonResolutionError(
            f"No downloadable file found for addon {addon_id!r} on AMO"
        )

    return addon_file["url"]
