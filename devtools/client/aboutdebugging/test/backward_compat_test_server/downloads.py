# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Download and unpack a released Firefox to use as the DevTools server.

Builds are fetched from the regular distribution channels, the same way
browser/installer/linux/script/install-firefox.sh does for the
linux-install-test tasks. Archives and unpacked builds are cached, keyed by the
version that download.mozilla.org redirected to, so that repeated runs only
re-download when the channel has moved on.
"""

from __future__ import annotations

import pathlib
import shutil
import urllib.parse

import mozinfo
import mozinstall
import requests

from .logs import log

DOWNLOAD_URL = "https://download.mozilla.org/"

# Channel to the "product" expected by download.mozilla.org.
PRODUCTS = {
    "beta": "firefox-beta-latest-ssl",
    "devedition": "firefox-devedition-latest-ssl",
    "release": "firefox-latest-ssl",
    "nightly": "firefox-nightly-latest-ssl",
}


def get_os() -> str:
    """Value of the "os" query parameter expected by download.mozilla.org."""
    if mozinfo.isMac:
        return "osx"
    if mozinfo.isWin:
        return "win64-aarch64" if mozinfo.processor == "aarch64" else "win64"
    if mozinfo.isLinux:
        return "linux64-aarch64" if mozinfo.processor == "aarch64" else "linux64"
    raise ValueError(f"Unsupported platform: {mozinfo.os}")


def resolve_archive_url(channel: str) -> str:
    """Follow the download.mozilla.org redirect to the actual archive URL.

    The redirect target contains the version, which is what we key the cache on.
    """
    payload = {
        "product": PRODUCTS[channel],
        "os": get_os(),
        "lang": "en-US",
    }

    response = requests.head(DOWNLOAD_URL, params=payload, allow_redirects=True)
    return response.url


def archive_name(url: str) -> str:
    """File name the archive at url should be saved under."""
    return urllib.parse.unquote(pathlib.Path(urllib.parse.urlparse(url).path).name)


def download(url: str, download_path: pathlib.Path) -> None:
    """Download url to path.

    The file only appears at path once it is complete, so an interrupted
    download cannot be mistaken for a usable one.
    """
    log(f"Downloading {url}")
    download_path.parent.mkdir(parents=True, exist_ok=True)

    partial = download_path.with_name(download_path.name + ".part")
    with requests.get(url, stream=True) as response:
        response.raise_for_status()
        with open(partial, "wb") as fp:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                fp.write(chunk)
    partial.rename(download_path)


def install(archive_path: pathlib.Path, install_path: pathlib.Path) -> str:
    """Unpack an archive into install_path.

    :returns: path of the application directory, which is a subdirectory of
        install_path whose name depends on the platform.
    """
    log(f"Unpacking {archive_path}")
    # mozinstall expects the destination not to exist, so clear out anything an
    # earlier interrupted run may have left behind.
    shutil.rmtree(install_path, ignore_errors=True)
    return mozinstall.install(archive_path, install_path)


def provision(channel: str, cache_dir: str) -> str:
    """Download and unpack the latest build for a channel, reusing the cache.

    :returns: path of the Firefox binary.
    """
    if channel not in PRODUCTS:
        raise ValueError(f"Unknown channel '{channel}'")

    url = resolve_archive_url(channel)
    name = archive_name(url)

    download_path = pathlib.Path(cache_dir) / channel / name
    if download_path.exists():
        log(f"Reusing the cached {channel} archive at {download_path}")
    else:
        download(url, download_path)

    # Keyed by channel as well as by archive name: beta and devedition ship the
    # same version, and therefore the same archive file name.
    install_path = pathlib.Path(cache_dir) / "installs" / channel / name

    # Cache the Firefox binary path in .installed.
    marker = install_path / ".installed"
    if marker.exists():
        # If .installed already exists, this firefox version was already
        # installed and the application path is in .installed
        with open(marker) as fp:
            app_dir = fp.read().strip()
    else:
        # Otherwise install Firefox and write the application path in .installed
        app_dir = install(download_path, install_path)
        with open(marker, "w") as fp:
            fp.write(app_dir)

    return mozinstall.get_binary(app_dir, "firefox")
