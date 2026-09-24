#!/usr/bin/python3 -u

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
This script downloads a Chrome component, as distributed in the CRX3 format,
and repacks it in the layout Gecko expects of a GMP plugin directory.

A CRX3 is a zip with a header prepended. Zip readers find the central
directory from the end of the file and skip over the header, so it can be
read without any special handling, which is how GMPInstallManager consumes
these in the browser.
"""

import argparse
import hashlib
import io
import os
import pathlib
import tarfile
import zipfile

import requests
import zstandard

# Mirrors GMPExtractor.worker.js, which keeps only the binaries and metadata.
# Also flattens away the platform specific subdirectory they are packaged in.
LIB_SUFFIXES = (".dll", ".dylib", ".so")
KEEP_SUFFIXES = LIB_SUFFIXES + (".info", ".sig", ".txt")
KEEP_NAMES = ("LICENSE", "manifest.json")


def fetch(url, sha256, size):
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    data = response.content

    if len(data) != size:
        raise Exception(f"{url} is {len(data)} bytes, expected {size}")

    digest = hashlib.sha256(data).hexdigest()
    if digest != sha256:
        raise Exception(f"{url} hashes to {digest}, expected {sha256}")

    return data


def repack(data, dest, prefix):
    dest.parent.mkdir(parents=True, exist_ok=True)
    kept = []
    libs = []

    with zipfile.ZipFile(io.BytesIO(data)) as zf, open(dest, "wb") as fh:
        compressor = zstandard.ZstdCompressor()
        with compressor.stream_writer(fh) as stream, tarfile.open(
            fileobj=stream, mode="w:"
        ) as tar:
            for entry in zf.infolist():
                if entry.is_dir():
                    continue
                name = os.path.basename(entry.filename)
                if not name.endswith(KEEP_SUFFIXES) and name not in KEEP_NAMES:
                    continue
                info = tarfile.TarInfo(prefix + name)
                if info.name in kept:
                    raise Exception(
                        f"Flattening {entry.filename} would collide with an "
                        f"entry already packed as {info.name}"
                    )
                info.size = entry.file_size
                info.mode = 0o755 if name.endswith(LIB_SUFFIXES) else 0o644
                # The zip holds local times with no zone, so use a fixed
                # timestamp rather than something that varies per download.
                info.mtime = 0
                with zf.open(entry) as src:
                    tar.addfile(info, src)
                kept.append(info.name)
                if name.endswith(LIB_SUFFIXES):
                    libs.append(info.name)

    if not libs:
        raise Exception(f"No plugin library found in the archive, kept {kept}")
    for name in kept:
        print(f"Packed {name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha256", required=True, help="SHA-256 of the download")
    parser.add_argument("--size", required=True, type=int, help="size of the download")
    parser.add_argument(
        "--add-prefix",
        default="",
        help="prefix to give each file in the resulting archive",
    )
    parser.add_argument("url", help="URL of the CRX3 to download")
    parser.add_argument("dest", help="path of the .tar.zst to produce")
    args = parser.parse_args()

    data = fetch(args.url, args.sha256, args.size)
    repack(data, pathlib.Path(args.dest), args.add_prefix)


if __name__ == "__main__":
    main()
