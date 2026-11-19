# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Fetch and cache artifacts from URLs.

This module manages fetching artifacts from URLS and purging old
artifacts using a simple Least Recently Used cache.

This module requires certain modules be importable from the ambient Python
environment.  Consumers will need to arrange this themselves.

The bulk of the complexity is in managing and persisting several caches.  If
we found a Python LRU cache that pickled cleanly, we could remove a lot of
this code!  Sadly, I found no such candidate implementations, so we pickle
pylru caches manually.

ArtifactCache.fetch may be called concurrently from multiple threads.
"""

import binascii
import hashlib
import logging
import os
import re
import tempfile
import threading
import urllib.parse as urlparse
from concurrent.futures import FIRST_EXCEPTION, ThreadPoolExecutor, wait

import dlmanager
import mozpack.path as mozpath
import requests
from requests.adapters import HTTPAdapter

from mozbuild.build_markers import build_marker
from mozbuild.dirutils import mkdir

# Using 'DownloadManager' through the provided interface we
# can't directly specify a 'chunk_size' for the 'Download' it manages.
# One way to get it to use the 'chunk_size' we want is to monkeypatch
# the defaults of the init function for the 'Download' class.
CHUNK_SIZE = 16 * 1024 * 1024  # 16 MB in bytes.
dl_init = dlmanager.Download.__init__
dl_init.__defaults__ = (
    dl_init.__defaults__[:1] + (CHUNK_SIZE,) + dl_init.__defaults__[2:]
)

# Artifacts larger than this are downloaded over several connections at once,
# when the server supports range requests.
PARALLEL_DOWNLOAD_MIN_SIZE = 64 * 1024 * 1024
PARALLEL_DOWNLOAD_CONNECTIONS = 8
RANGE_CHUNK_SIZE = 1024 * 1024
CONTENT_RANGE_RE = re.compile(r"bytes 0-(\d+)/(\d+)$")


class DownloadCanceled(Exception):
    pass


# Minimum number of downloaded artifacts to keep. Each artifact can be very large,
# so don't make this to large!
MIN_CACHED_ARTIFACTS = 12

# Maximum size of the downloaded artifacts to keep in cache, in bytes (4GiB).
MAX_CACHED_ARTIFACTS_SIZE = 4 * 1024 * 1024 * 1024


class ArtifactPersistLimit(dlmanager.PersistLimit):
    """Handle persistence for a cache of artifacts.

    When instantiating a DownloadManager, it starts by filling the
    PersistLimit instance it's given with register_dir_content.
    In practice, this registers all the files already in the cache directory.
    After a download finishes, the newly downloaded file is registered, and the
    oldest files registered to the PersistLimit instance are removed depending
    on the size and file limits it's configured for.

    This is all good, but there are a few tweaks we want here:

      - We have pickle files in the cache directory that we don't want purged.
      - Files that were just downloaded in the same session shouldn't be
        purged. (if for some reason we end up downloading more than the default
        max size, we don't want the files to be purged)

    To achieve this, this subclass of PersistLimit inhibits the register_file
    method for pickle files and tracks what files were downloaded in the same
    session to avoid removing them.

    The register_file method may be used to register cache matches too, so that
    later sessions know they were freshly used.
    """

    def __init__(self, log=None):
        super().__init__(
            size_limit=MAX_CACHED_ARTIFACTS_SIZE, file_limit=MIN_CACHED_ARTIFACTS
        )
        self._log = log
        self._registering_dir = False
        self._downloaded_now = set()
        self._lock = threading.RLock()

    def log(self, *args, **kwargs):
        if self._log:
            self._log(*args, **kwargs)

    def register_file(self, path):
        if (
            path.endswith(".pickle")
            or path.endswith(".checksum")
            or os.path.basename(path) == ".metadata_never_index"
        ):
            return
        with self._lock:
            self._register_file(path)

    def _register_file(self, path):
        if not self._registering_dir:
            # Touch the file so that subsequent calls to a mach artifact
            # command know it was recently used. While remove_old_files
            # is based on access time, in various cases, the access time is not
            # updated when just reading the file, so we force an update.
            try:
                os.utime(path, None)
            except OSError:
                pass
            self._downloaded_now.add(path)
        super().register_file(path)

    def register_dir_content(self, directory, pattern="*"):
        self._registering_dir = True
        super().register_dir_content(directory, pattern)
        self._registering_dir = False

    def remove_old_files(self):
        with self._lock:
            self._remove_old_files()

    def _remove_old_files(self):
        from dlmanager import fs

        files = sorted(self.files, key=lambda f: f.stat.st_atime)
        kept = []
        while len(files) > self.file_limit and self._files_size >= self.size_limit:
            f = files.pop(0)
            if f.path in self._downloaded_now:
                kept.append(f)
                continue
            try:
                fs.remove(f.path)
            except OSError:
                # For some reason, on automation, we can't remove those files.
                # So for now, ignore the error.
                kept.append(f)
                continue
            self.log(
                logging.INFO,
                "artifact",
                {"filename": f.path},
                "Purged artifact {filename}",
            )
            self._files_size -= f.stat.st_size
        self.files = files + kept

    def remove_all(self):
        from dlmanager import fs

        for f in self.files:
            fs.remove(f.path)
        self._files_size = 0
        self.files = []


class ArtifactCache:
    """Fetch artifacts from URLS and purge least recently used artifacts from disk."""

    def __init__(self, cache_dir, log=None, skip_cache=False):
        mkdir(cache_dir, not_indexed=True)
        self._cache_dir = cache_dir
        self._log = log
        self._skip_cache = skip_cache
        self._persist_limit = ArtifactPersistLimit(log)
        session = requests.Session()
        # All artifacts are fetched at once from the same host, and the
        # package, tests and symbols archives each use
        # PARALLEL_DOWNLOAD_CONNECTIONS connections.
        session.mount(
            "https://", HTTPAdapter(pool_maxsize=4 * PARALLEL_DOWNLOAD_CONNECTIONS)
        )
        session.hooks["response"].append(self._track_response)
        self._download_manager = dlmanager.DownloadManager(
            self._cache_dir, session=session, persist_limit=self._persist_limit
        )
        self._response = threading.local()
        self._stop_events = set()
        self._stop_events_lock = threading.Lock()

    def log(self, *args, **kwargs):
        if self._log:
            self._log(*args, **kwargs)

    def _track_response(self, response, *args, **kwargs):
        self._response.current = response

    def fetch(self, url, force=False):
        fname = os.path.basename(url)
        try:
            # Use the file name from the url if it looks like a hash digest.
            if len(fname) not in (32, 40, 56, 64, 96, 128):
                raise TypeError()
            binascii.unhexlify(fname)
        except (TypeError, binascii.Error):
            # We download to a temporary name like HASH[:16]-basename to
            # differentiate among URLs with the same basenames.  We used to then
            # extract the build ID from the downloaded artifact and use it to make a
            # human readable unique name, but extracting build IDs is time consuming
            # (especially on Mac OS X, where we must mount a large DMG file).
            hash = hashlib.sha256(url.encode()).hexdigest()[:16]
            # Strip query string and fragments.
            basename = os.path.basename(urlparse.urlparse(url).path)
            fname = hash + "-" + basename

        path = os.path.abspath(mozpath.join(self._cache_dir, fname))
        if self._skip_cache and os.path.exists(path):
            self.log(
                logging.INFO,
                "artifact",
                {"path": path},
                "Skipping cache: removing cached downloaded artifact {path}",
            )
            os.remove(path)

        if os.path.exists(path):
            return self._fetch_with_dlmanager(url, fname)

        self.log(
            logging.INFO,
            "artifact",
            {"path": path},
            "Downloading artifact to local cache: {path}",
        )
        with build_marker("ArtifactDownload", url, log=self.log):
            if self._fetch_with_ranges(url, path, fname):
                return path
            return self._fetch_with_dlmanager(url, fname)

    def _progress_reporter(self, fname):
        """Returns a thread-safe function logging the download progress of
        fname every 5%, given the number of bytes downloaded and the total."""
        lock = threading.Lock()
        last_update = -1

        def report(bytes_so_far, total_size):
            nonlocal last_update
            if not total_size:
                return
            percent = bytes_so_far * 100.0 / total_size
            with lock:
                if int(percent / 5) <= last_update:
                    return
                last_update = int(percent / 5)
            self.log(
                logging.INFO,
                "artifact",
                {
                    "fname": fname,
                    "bytes_so_far": bytes_so_far,
                    "total_size": total_size,
                    "percent": percent,
                },
                "Downloading {fname}... {percent:02.1f} %",
            )

        return report

    def _fetch_with_dlmanager(self, url, fname):
        report = self._progress_reporter(fname)

        def download_progress(dl, _decoded_bytes, total_size):
            # Content-Length is the compressed size, but dlmanager counts decoded bytes.
            report(self._response.current.raw.tell(), total_size)

        dl = None
        try:
            dl = self._download_manager.download(url, fname, progress=download_progress)
            if dl:
                dl.wait()
            else:
                path = os.path.join(self._cache_dir, fname)
                self.log(
                    logging.INFO,
                    "artifact",
                    {"path": os.path.abspath(path)},
                    "Using artifact from local cache: {path}",
                )
                # Avoid the file being removed if it was in the cache already.
                self._persist_limit.register_file(path)

            return os.path.abspath(mozpath.join(self._cache_dir, fname))
        finally:
            # Cancel the background download if it is still in progress.
            if dl:
                dl.cancel()

    def _fetch_with_ranges(self, url, path, fname):
        """Download url to path, getting the first PARALLEL_DOWNLOAD_MIN_SIZE
        bytes in a first request, and the rest of larger artifacts over
        several connections at once. Returns False when the server's response
        doesn't allow this, in which case the caller falls back to dlmanager."""
        response = self._download_manager.session.get(
            url,
            headers={"Range": f"bytes=0-{PARALLEL_DOWNLOAD_MIN_SIZE - 1}"},
            stream=True,
        )
        with response:
            # Empty artifacts can't satisfy the range.
            if response.status_code == 416:
                return False
            response.raise_for_status()
            with tempfile.NamedTemporaryFile(
                dir=self._cache_dir, suffix=".tmp", delete=False
            ) as temp:
                pass
            stop = threading.Event()
            with self._stop_events_lock:
                self._stop_events.add(stop)
            try:
                if not self._download_ranges(url, response, temp.name, fname, stop):
                    return False
                os.replace(temp.name, path)
            except requests.RequestException as e:
                self.log(
                    logging.WARNING,
                    "artifact",
                    {"url": url, "error": str(e)},
                    "Download of {url} failed, retrying over one connection: {error}",
                )
                return False
            finally:
                with self._stop_events_lock:
                    self._stop_events.discard(stop)
                if os.path.exists(temp.name):
                    os.remove(temp.name)
        self._persist_limit.register_file(path)
        self._persist_limit.remove_old_files()
        return True

    def _download_ranges(self, url, response, temp_path, fname, stop):
        """Write the artifact to temp_path, given the response to the request
        for its first range. stop is set to cancel the download."""
        session = self._download_manager.session
        report = self._progress_reporter(fname)

        match = CONTENT_RANGE_RE.match(response.headers.get("Content-Range", ""))
        if response.status_code == 200 or (
            response.status_code == 206
            and match
            and int(match.group(1)) + 1 == int(match.group(2))
        ):
            # The response holds the whole artifact.
            total_size = response.headers.get("Content-Length", "").strip()
            total_size = int(total_size) if total_size else None
            report(0, total_size)
            with open(temp_path, "wb") as fh:
                for chunk in response.iter_content(CHUNK_SIZE):
                    if stop.is_set():
                        raise DownloadCanceled()
                    fh.write(chunk)
                    # Content-Length is the size of the encoded content.
                    report(response.raw.tell(), total_size)
            return True

        if (
            response.status_code != 206
            or not match
            or response.headers.get("Content-Encoding", "identity")
            not in ("identity", "")
        ):
            return False

        first_end = int(match.group(1))
        size = int(match.group(2))
        with open(temp_path, "wb") as fh:
            fh.truncate(size)
        report(0, size)

        # Use the URL we were redirected to for the remaining ranges.
        response_url = response.url
        progress_lock = threading.Lock()
        downloaded = 0

        def fetch_range(start, end, response=None):
            nonlocal downloaded
            if response is None:
                response = session.get(
                    response_url,
                    headers={
                        "Range": f"bytes={start}-{end}",
                        "Accept-Encoding": "identity",
                    },
                    stream=True,
                )
            with response, open(temp_path, "r+b") as fh:
                response.raise_for_status()
                if response.status_code != 206:
                    raise requests.RequestException(
                        f"Expected a partial response, got {response.status_code}"
                    )
                fh.seek(start)
                for chunk in response.iter_content(RANGE_CHUNK_SIZE):
                    if stop.is_set():
                        raise DownloadCanceled()
                    fh.write(chunk)
                    with progress_lock:
                        downloaded += len(chunk)
                        bytes_so_far = downloaded
                    report(bytes_so_far, size)
                if fh.tell() != end + 1:
                    raise requests.RequestException(
                        f"Incomplete range {start}-{end} of {url}"
                    )

        remaining = size - first_end - 1
        range_size = -(-remaining // (PARALLEL_DOWNLOAD_CONNECTIONS - 1))
        ranges = [
            (start, min(start + range_size, size) - 1)
            for start in range(first_end + 1, size, range_size)
        ]
        with ThreadPoolExecutor(len(ranges) + 1) as executor:
            futures = [executor.submit(fetch_range, 0, first_end, response)] + [
                executor.submit(fetch_range, start, end) for start, end in ranges
            ]
            try:
                wait(futures, return_when=FIRST_EXCEPTION)
            finally:
                stop.set()
        errors = [f.exception() for f in futures if f.exception()]
        if errors:
            # Ranges stopped because another one failed raise
            # DownloadCanceled, so report the original failure.
            raise next(
                (e for e in errors if not isinstance(e, DownloadCanceled)),
                errors[0],
            )
        return True

    def cancel(self):
        """Cancel all background downloads in progress."""
        with self._stop_events_lock:
            for stop in self._stop_events:
                stop.set()
        self._download_manager.cancel()

    def clear_cache(self):
        if self._skip_cache:
            self.log(
                logging.INFO, "artifact", {}, "Skipping cache: ignoring clear_cache!"
            )
            return

        self._persist_limit.remove_all()
