# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import hashlib
from unittest import mock

import mozunit
import pytest

from mozrelease import generate_checksums
from mozrelease.checksums import parse_checksums_file

PREFIX = "pub/firefox/candidates/1.0-candidates/build1/"

LISTING_PAGE_1 = f"""<?xml version='1.0' encoding='UTF-8'?>
<ListBucketResult xmlns='http://doc.s3.amazonaws.com/2006-03-01'>
<Name>bucket</Name><Prefix>{PREFIX}</Prefix><IsTruncated>true</IsTruncated>
<NextMarker>{PREFIX}a.beet</NextMarker>
<Contents><Key>{PREFIX}a.beet</Key></Contents>
<Contents><Key>{PREFIX}a.tar.xz</Key></Contents>
</ListBucketResult>"""

LISTING_PAGE_2 = f"""<?xml version='1.0' encoding='UTF-8'?>
<ListBucketResult xmlns='http://doc.s3.amazonaws.com/2006-03-01'>
<Name>bucket</Name><Prefix>{PREFIX}</Prefix><IsTruncated>false</IsTruncated>
<Contents><Key>{PREFIX}b.beet</Key></Contents>
<Contents><Key>{PREFIX}old.checksums</Key></Contents>
</ListBucketResult>"""


def _sums(data):
    return {
        "sha256": hashlib.sha256(data).hexdigest().encode("ascii"),
        "sha512": hashlib.sha512(data).hexdigest().encode("ascii"),
    }


def _beet(entries):
    lines = []
    for name, data in entries.items():
        sums = _sums(data)
        for fmt in ("sha256", "sha512"):
            lines.append(f"{sums[fmt].decode()} {fmt} {len(data)} {name}")
    return ("\n".join(lines) + "\n").encode("utf-8")


BEETS = {
    f"{PREFIX}a.beet": _beet({
        "linux-x86_64/en-US/firefox-1.0.tar.xz": b"linux",
        "linux-x86_64/en-US/firefox-1.0.txt": b"ignored",
    }),
    f"{PREFIX}b.beet": _beet({
        "win64/en-US/Firefox Setup 1.0.exe": b"win",
        "linux-x86_64/en-US/firefox-1.0.tar.xz": b"linux",
    }),
}


class FakeResponse:
    def __init__(self, content):
        self.content = content

    def raise_for_status(self):
        pass


class FakeSession:
    def __init__(self):
        self.requests = []

    def get(self, url, params=None, timeout=None):
        self.requests.append((url, params))
        if url == f"{generate_checksums.STORAGE_URL}/bucket":
            if params.get("marker"):
                return FakeResponse(LISTING_PAGE_2.encode("utf-8"))
            return FakeResponse(LISTING_PAGE_1.encode("utf-8"))
        key = url[len(f"{generate_checksums.STORAGE_URL}/bucket/") :]
        return FakeResponse(BEETS[key])


def test_list_keys_follows_markers():
    session = FakeSession()
    keys = list(generate_checksums.list_keys(session, "bucket", PREFIX))
    assert keys == [
        f"{PREFIX}a.beet",
        f"{PREFIX}a.tar.xz",
        f"{PREFIX}b.beet",
        f"{PREFIX}old.checksums",
    ]
    assert session.requests[1][1]["marker"] == f"{PREFIX}a.beet"


def test_find_checksums_files_prefers_beets():
    keys = generate_checksums.find_checksums_files(FakeSession(), "bucket", PREFIX)
    assert keys == [f"{PREFIX}a.beet", f"{PREFIX}b.beet"]


def test_collect_individual_checksums_filters_and_dedupes():
    checksums = generate_checksums.collect_individual_checksums(
        FakeSession(), "bucket", PREFIX, 2
    )
    assert sorted(checksums) == [
        "linux-x86_64/en-US/firefox-1.0.tar.xz",
        "win64/en-US/Firefox Setup 1.0.exe",
    ]
    assert checksums["linux-x86_64/en-US/firefox-1.0.tar.xz"]["hashes"] == _sums(
        b"linux"
    )


def test_collect_individual_checksums_rejects_conflicts():
    beets = dict(BEETS)
    beets[f"{PREFIX}b.beet"] = _beet({
        "linux-x86_64/en-US/firefox-1.0.tar.xz": b"different",
    })
    with mock.patch.dict(BEETS, beets), pytest.raises(SystemExit):
        generate_checksums.collect_individual_checksums(
            FakeSession(), "bucket", PREFIX, 2
        )


def test_outputs():
    checksums = parse_checksums_file(
        _beet({
            "b/firefox-1.0.tar.xz": b"two",
            "a/firefox-1.0.tar.xz": b"one",
        })
    )
    sums = generate_checksums.create_big_checksums(checksums, "sha256")
    assert sums == (
        f"{hashlib.sha256(b'one').hexdigest()}  a/firefox-1.0.tar.xz\n"
        f"{hashlib.sha256(b'two').hexdigest()}  b/firefox-1.0.tar.xz\n"
    )
    summary = generate_checksums.create_summary(checksums, "sha256")
    lines = summary.splitlines()
    assert lines[0].endswith(" TREE_HEAD")
    assert lines[1].endswith(" a/firefox-1.0.tar.xz")
    assert lines[2].endswith(" b/firefox-1.0.tar.xz")


def test_file_prefix():
    assert (
        generate_checksums.get_file_prefix("firefox", "59.0b5", "2")
        == "pub/firefox/candidates/59.0b5-candidates/build2/"
    )


if __name__ == "__main__":
    mozunit.main()
