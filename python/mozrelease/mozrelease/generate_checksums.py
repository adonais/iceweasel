# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""Build the SHA*SUMS and SHA*SUMMARY files of a release from the per file
checksums that beetmover uploaded to the candidates directory."""

import argparse
import binascii
import hashlib
import logging
import os
import re
import sys
import xml.etree.ElementTree as ET
from multiprocessing.pool import ThreadPool

import requests
from redo import retry

from mozrelease.checksums import parse_checksums_file
from mozrelease.merkle import MerkleTree

log = logging.getLogger(__name__)

STORAGE_URL = "https://storage.googleapis.com"
S3_NS = {"s3": "http://doc.s3.amazonaws.com/2006-03-01"}

FORMATS = ["sha512", "sha256"]

INCLUDES = [
    r"^.*\.tar\.bz2$",
    r"^.*\.tar\.xz$",
    r"^.*\.snap$",
    r"^.*\.dmg$",
    r"^.*\.pkg$",
    r"^.*\.bundle$",
    r"^.*\.mar$",
    r"^.*Setup.*\.exe$",
    r"^.*Installer\.exe$",
    r"^.*\.msi$",
    r"^.*\.xpi$",
    r"^.*fennec.*\.apk$",
    r"^.*/jsshell.*$",
]


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--stage-product",
        required=True,
        help="Name of product used in file server's directory structure, "
        "e.g.: firefox, mobile",
    )
    parser.add_argument(
        "--version", required=True, help="Version of release, e.g.: 59.0b5"
    )
    parser.add_argument(
        "--build-number", required=True, help="Build number of release, e.g.: 2"
    )
    parser.add_argument(
        "--bucket-name",
        required=True,
        help="Full bucket name e.g.: moz-fx-productdelivery-pr-38b5-productdelivery.",
    )
    parser.add_argument(
        "-j",
        "--parallelization",
        default=20,
        type=int,
        help="Number of checksums file to download concurrently",
    )
    parser.add_argument(
        "--output-dir",
        default=os.getcwd(),
        help="Directory the SUMS and SUMMARY files are written to",
    )
    return parser.parse_args(argv)


def get_file_prefix(stage_product, version, build_number):
    return f"pub/{stage_product}/candidates/{version}-candidates/build{build_number}/"


def get_hash_function(format_):
    if format_ in ("sha256", "sha384", "sha512"):
        return getattr(hashlib, format_)
    raise SystemExit(f"Unsupported format {format_}")


def _get(session, url, **params):
    def fetch():
        response = session.get(url, params=params, timeout=60)
        response.raise_for_status()
        return response

    return retry(
        fetch,
        attempts=5,
        sleeptime=5,
        max_sleeptime=30,
        retry_exceptions=(requests.RequestException,),
    )


def list_keys(session, bucket_name, prefix):
    marker = None
    while True:
        params = {"prefix": prefix}
        if marker:
            params["marker"] = marker
        root = ET.fromstring(
            _get(session, f"{STORAGE_URL}/{bucket_name}", **params).content
        )
        keys = [
            c.findtext("s3:Key", namespaces=S3_NS)
            for c in root.findall("s3:Contents", S3_NS)
        ]
        yield from keys
        if root.findtext("s3:IsTruncated", namespaces=S3_NS) != "true":
            return
        marker = root.findtext("s3:NextMarker", namespaces=S3_NS) or keys[-1]


def find_checksums_files(session, bucket_name, file_prefix):
    log.info("Getting key names from bucket")
    checksum_files = {"beets": [], "checksums": []}
    for key in list_keys(session, bucket_name, file_prefix):
        if key.endswith(".checksums"):
            log.debug(f"Found checksums file: {key}")
            checksum_files["checksums"].append(key)
        elif key.endswith(".beet"):
            log.debug(f"Found beet file: {key}")
            checksum_files["beets"].append(key)
        else:
            log.debug(f"Ignoring non-checksums file: {key}")
    if checksum_files["beets"]:
        log.info("Using beet format")
        return checksum_files["beets"]
    log.info("Using checksums format")
    return checksum_files["checksums"]


def collect_individual_checksums(session, bucket_name, file_prefix, parallelization):
    """Download every small checksums file of the release, filter out the
    files that do not belong in the big checksums, and return the rest keyed
    by file name."""
    log.info(f"File prefix is: {file_prefix}")

    def worker(key):
        log.debug(f"Downloading {key}")
        return _get(session, f"{STORAGE_URL}/{bucket_name}/{key}").content

    pool = ThreadPool(parallelization)
    raw_checksums = pool.map(
        worker, find_checksums_files(session, bucket_name, file_prefix)
    )

    checksums = {}
    for c in raw_checksums:
        for f, info in parse_checksums_file(c).items():
            for pattern in INCLUDES:
                if re.search(pattern, f):
                    if f in checksums:
                        if info == checksums[f]:
                            log.debug(
                                f"Duplicate checksum for file {f}"
                                " but the data matches;"
                                " continuing..."
                            )
                            continue
                        raise SystemExit(
                            f"Found duplicate checksum entry for {f}, "
                            "don't know which one to pick."
                        )
                    if not set(FORMATS) <= set(info["hashes"]):
                        raise SystemExit(f"Missing necessary format for file {f}")
                    log.debug(f"Adding checksums for file: {f}")
                    checksums[f] = info
                    break
            else:
                log.debug(f"Ignoring checksums for file: {f}")
    return checksums


def create_summary(checksums, fmt):
    """Compute a Merkle tree over the checksums of one format and return the
    file content holding the head of the tree and the inclusion proof of
    every file."""
    hash_fn = get_hash_function(fmt)
    files = sorted(checksums)
    data = [checksums[fn]["hashes"][fmt] for fn in files]

    tree = MerkleTree(hash_fn, data)
    head = binascii.hexlify(tree.head())
    proofs = [
        binascii.hexlify(tree.inclusion_proof(i).to_rfc6962_bis())
        for i in range(len(files))
    ]

    content = f"{head.decode('ascii')} TREE_HEAD\n"
    for i in range(len(files)):
        content += f"{proofs[i].decode('ascii')} {files[i]}\n"
    return content


def create_big_checksums(checksums, fmt):
    return "".join(
        f"{checksums[fn]['hashes'][fmt].decode('ascii')}  {fn}\n"
        for fn in sorted(checksums)
    )


def write_outputs(checksums, output_dir):
    for fmt in FORMATS:
        sums = os.path.join(output_dir, f"{fmt.upper()}SUMS")
        log.info(f"Creating big checksums file: {sums}")
        with open(sums, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(create_big_checksums(checksums, fmt))

        summary = os.path.join(output_dir, f"{fmt.upper()}SUMMARY")
        log.info(f"Creating summary file: {summary}")
        with open(summary, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(create_summary(checksums, fmt))


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
    args = parse_args(argv)
    file_prefix = get_file_prefix(args.stage_product, args.version, args.build_number)
    session = requests.Session()
    checksums = collect_individual_checksums(
        session, args.bucket_name, file_prefix, args.parallelization
    )
    write_outputs(checksums, args.output_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
