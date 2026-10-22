# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import gzip
import io
import os
import time
import unittest
from shutil import rmtree
from tempfile import mkdtemp

import mozunit
from requests.adapters import HTTPAdapter
from urllib3 import HTTPResponse

from mozbuild import artifact_cache
from mozbuild.artifact_cache import ArtifactCache

CONTENTS = {
    "http://server/foo": b"foo",
    "http://server/bar": b"bar" * 400,
    "http://server/qux": b"qux" * 400,
    "http://server/fuga": b"fuga" * 300,
    "http://server/hoge": b"hoge" * 300,
    "http://server/larger": b"larger" * 3000,
}


class FakeAdapter(HTTPAdapter):
    def __init__(self, gzip_encoded=False):
        super().__init__()
        self._gzip_encoded = gzip_encoded

    def send(self, request, **kwargs):
        body = CONTENTS[request.url]
        headers = {}
        if self._gzip_encoded:
            body = gzip.compress(body)
            headers["Content-Encoding"] = "gzip"
        headers["Content-Length"] = str(len(body))
        raw = HTTPResponse(
            body=io.BytesIO(body), headers=headers, status=200, preload_content=False
        )
        return self.build_response(request, raw)


class TestArtifactCache(unittest.TestCase):
    def setUp(self):
        self.min_cached_artifacts = artifact_cache.MIN_CACHED_ARTIFACTS
        self.max_cached_artifacts_size = artifact_cache.MAX_CACHED_ARTIFACTS_SIZE
        artifact_cache.MIN_CACHED_ARTIFACTS = 2
        artifact_cache.MAX_CACHED_ARTIFACTS_SIZE = 4096

        self._real_utime = os.utime
        os.utime = self.utime
        self.timestamp = time.time() - 86400

        self.tmpdir = mkdtemp()

    def tearDown(self):
        rmtree(self.tmpdir)
        artifact_cache.MIN_CACHED_ARTIFACTS = self.min_cached_artifacts
        artifact_cache.MAX_CACHED_ARTIFACTS_SIZE = self.max_cached_artifacts_size
        os.utime = self._real_utime

    def utime(self, path, times):
        if times is None:
            # Ensure all downloaded files have a different timestamp
            times = (self.timestamp, self.timestamp)
            self.timestamp += 2
        self._real_utime(path, times)

    def listtmpdir(self):
        return [p for p in os.listdir(self.tmpdir) if p != ".metadata_never_index"]

    def test_artifact_cache_persistence(self):
        cache = ArtifactCache(self.tmpdir)
        cache._download_manager.session.mount("http://", FakeAdapter())

        path = cache.fetch("http://server/foo")
        expected = [os.path.basename(path)]
        self.assertEqual(self.listtmpdir(), expected)

        path = cache.fetch("http://server/bar")
        expected.append(os.path.basename(path))
        self.assertEqual(sorted(self.listtmpdir()), sorted(expected))

        # We're downloading more than the cache allows us, but since it's all
        # in the same session, no purge happens.
        path = cache.fetch("http://server/qux")
        expected.append(os.path.basename(path))
        self.assertEqual(sorted(self.listtmpdir()), sorted(expected))

        path = cache.fetch("http://server/fuga")
        expected.append(os.path.basename(path))
        self.assertEqual(sorted(self.listtmpdir()), sorted(expected))

        cache = ArtifactCache(self.tmpdir)
        cache._download_manager.session.mount("http://", FakeAdapter())

        # Downloading a new file in a new session purges the oldest files in
        # the cache.
        path = cache.fetch("http://server/hoge")
        expected.append(os.path.basename(path))
        expected = expected[2:]
        self.assertEqual(sorted(self.listtmpdir()), sorted(expected))

        # Downloading a file already in the cache leaves the cache untouched
        cache = ArtifactCache(self.tmpdir)
        cache._download_manager.session.mount("http://", FakeAdapter())

        path = cache.fetch("http://server/qux")
        self.assertEqual(sorted(self.listtmpdir()), sorted(expected))

        # bar was purged earlier, re-downloading it should purge the oldest
        # downloaded file, which at this point would be qux, but we also
        # re-downloaded it in the mean time, so the next one (fuga) should be
        # the purged one.
        cache = ArtifactCache(self.tmpdir)
        cache._download_manager.session.mount("http://", FakeAdapter())

        path = cache.fetch("http://server/bar")
        expected.append(os.path.basename(path))
        expected = [p for p in expected if "fuga" not in p]
        self.assertEqual(sorted(self.listtmpdir()), sorted(expected))

        # Downloading one file larger than the cache size should still leave
        # MIN_CACHED_ARTIFACTS files.
        cache = ArtifactCache(self.tmpdir)
        cache._download_manager.session.mount("http://", FakeAdapter())

        path = cache.fetch("http://server/larger")
        expected.append(os.path.basename(path))
        expected = expected[-2:]
        self.assertEqual(sorted(self.listtmpdir()), sorted(expected))

    def test_artifact_cache_content_encoding(self):
        logged = []
        cache = ArtifactCache(
            self.tmpdir, log=lambda level, action, params, fmt: logged.append(params)
        )
        cache._download_manager.session.mount("http://", FakeAdapter(gzip_encoded=True))

        path = cache.fetch("http://server/larger")
        with open(path, "rb") as fh:
            self.assertEqual(fh.read(), CONTENTS["http://server/larger"])
        self.assertEqual([p["percent"] for p in logged if "percent" in p], [0.0, 100.0])


if __name__ == "__main__":
    mozunit.main()
