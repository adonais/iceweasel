# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import asyncio
import http.client
import json
import logging
import math
import pprint
import re
import socket
import sys
from collections import namedtuple
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import urlopen

import aiohttp
import hglib
from hglib.util import cmdbuilder
from looseversion import LooseVersion
from mozilla_version.gecko import GeckoVersion
from mozilla_version.version import VersionType
from redo import retry

from mozrelease.l10n import getPlatformLocales
from mozrelease.paths import (
    getCandidatesDir,
    getReleaseInstallerPath,
    getReleasesDir,
)
from mozrelease.platforms import ftp2infoFile, ftp2updatePlatforms
from mozrelease.update_verify import UpdateVerifyConfig
from mozrelease.versions import MozillaVersion, getPrettyVersion

log = logging.getLogger(__name__)


# ensure all versions are 3 part (i.e. 99.1.0)
# ensure all text (i.e. 'esr') is in the last part
class CompareVersion(LooseVersion):
    version = ""

    def __init__(self, versionMap):
        parts = versionMap.split(".")
        # assume version is 99.9.0, look for 99.0
        if len(parts) == 2:
            intre = re.compile("([0-9.]+)(.*)")
            match = intre.match(parts[-1])
            if match:
                parts[-1] = match.group(1)
                parts.append(f"0{match.group(2)}")
        else:
            parts.append("0")
        self.version = ".".join(parts)
        LooseVersion(versionMap)


BuildInfo = namedtuple("BuildInfo", ["product", "version", "buildID"])


def is_triangular(x):
    """Check if a number is triangular (0, 1, 3, 6, 10, 15, ...)
    see: https://en.wikipedia.org/wiki/Triangular_number#Triangular_roots_and_tests_for_triangular_numbers # noqa

    >>> is_triangular(0)
    True
    >>> is_triangular(1)
    True
    >>> is_triangular(2)
    False
    >>> is_triangular(3)
    True
    >>> is_triangular(4)
    False
    >>> all(
    ...     is_triangular(x)
    ...     for x in [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91, 105]
    ... )
    True
    >>> all(
    ...     not is_triangular(x)
    ...     for x in [4, 5, 8, 9, 11, 17, 25, 29, 39, 44, 59, 61, 72, 98, 112]
    ... )
    True
    """
    # pylint --py3k W1619
    n = (math.sqrt(8 * x + 1) - 1) / 2
    return n == int(n)


def retry_download(url, sleeptime=60, max_sleeptime=5 * 60, attempts=5):
    """Fetch url with retries, returning the response or None on failure."""
    try:
        return retry(
            urlopen,
            args=(url,),
            attempts=attempts,
            sleeptime=sleeptime,
            max_sleeptime=max_sleeptime,
            retry_exceptions=(
                HTTPError,
                URLError,
                http.client.HTTPException,
                socket.timeout,
                OSError,
            ),
        )
    except Exception as e:
        log.warning(f"Can't download from {url}: {e}")
        return None


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Generate an update verify config for a release."
    )
    parser.add_argument(
        "--product",
        required=True,
        help="Product being tested, as used in the update URL and filenames. Eg: firefox",
    )
    parser.add_argument(
        "--stage-product",
        help="Product being tested, as used in stage directories and ship it. "
        "If not passed this is assumed to be the same as product.",
    )
    parser.add_argument(
        "--app-name", required=True, help="App name being tested. Eg: browser"
    )
    parser.add_argument(
        "--branch-prefix",
        required=True,
        help="Prefix of release branch names. Eg: mozilla, comm",
    )
    parser.add_argument(
        "--channel", required=True, help="Channel to run update verify against"
    )
    parser.add_argument(
        "--aus-server",
        default="https://aus5.mozilla.org",
        help="AUS server to run update verify against",
    )
    parser.add_argument(
        "--to-version",
        required=True,
        help="The version of the release being updated to. Eg: 59.0b5",
    )
    parser.add_argument(
        "--to-app-version",
        required=True,
        help="The in-app version of the release being updated to. Eg: 59.0",
    )
    parser.add_argument(
        "--to-display-version",
        help="The human-readable version of the release being updated to. Eg: 59.0 Beta 9",
    )
    parser.add_argument(
        "--to-build-number",
        required=True,
        help="The build number of the release being updated to",
    )
    parser.add_argument(
        "--to-buildid",
        required=True,
        help="The buildid of the release being updated to",
    )
    parser.add_argument(
        "--to-revision",
        required=True,
        help="The revision that the release being updated to was built against",
    )
    parser.add_argument(
        "--partial-version",
        dest="partial_versions",
        default=[],
        action="append",
        help="A previous release version that is expected to receive a partial update. "
        "Eg: 59.0b4. May be specified multiple times.",
    )
    parser.add_argument(
        "--last-watershed",
        required=True,
        help="The earliest version to include in the update verify config. Eg: 57.0b10",
    )
    parser.add_argument(
        "--include-version",
        dest="include_versions",
        default=[],
        action="append",
        help="Only include versions that match one of these regexes. "
        "May be passed multiple times",
    )
    parser.add_argument(
        "--mar-channel-id-override",
        dest="mar_channel_id_options",
        default=[],
        action="append",
        help="A version regex and channel id string to override those versions with."
        "Eg: ^\\d+\\.\\d+(\\.\\d+)?$,firefox-mozilla-beta,firefox-mozilla-release "
        "will set accepted mar channel ids to 'firefox-mozilla-beta' and "
        "'firefox-mozilla-release for x.y and x.y.z versions. "
        "May be passed multiple times",
    )
    parser.add_argument(
        "--override-certs",
        default=None,
        help="Certs to override the updater with prior to running update verify. "
        "If passed, should be one of: dep, nightly, release. "
        "If not passed, no certificate overriding will be configured",
    )
    parser.add_argument(
        "--platform",
        required=True,
        help="The platform to generate the update verify config for, in FTP-style",
    )
    parser.add_argument(
        "--updater-platform",
        help="The platform to run the updater on, in FTP-style. "
        "If not specified, this is assumed to be the same as platform",
    )
    parser.add_argument(
        "--archive-prefix",
        required=True,
        help="The server/path to pull the current release from. "
        "Eg: https://archive.mozilla.org/pub",
    )
    parser.add_argument(
        "--previous-archive-prefix",
        help="The server/path to pull the previous releases from. "
        "If not specified, this is assumed to be the same as --archive-prefix",
    )
    parser.add_argument(
        "--repo-path",
        required=True,
        help="The repository (relative to the hg server root) that the current "
        "release was built from Eg: releases/mozilla-beta",
    )
    parser.add_argument(
        "--output-file",
        required=True,
        help="Where to write the update verify config to",
    )
    parser.add_argument(
        "--product-details-server",
        default="https://product-details.mozilla.org",
        help="Product Details server to pull previous release info from. "
        "Using anything other than the production server is likely to "
        "cause issues with update verify.",
    )
    parser.add_argument(
        "--last-linux-bz2-version",
        help="Last linux build version with bz2 compression.",
    )
    parser.add_argument(
        "--hg-server",
        default="https://hg.mozilla.org",
        help="Mercurial server to pull various previous and current version info from",
    )
    parser.add_argument(
        "--full-check-locale",
        dest="full_check_locales",
        default=["de", "en-US", "ru"],
        action="append",
        help="A list of locales to generate full update verify checks for",
    )
    parser.add_argument(
        "--local-repo",
        help="Path to local clone of the repository",
    )
    args = parser.parse_args(argv)

    if not args.updater_platform:
        args.updater_platform = args.platform
    if not args.stage_product:
        args.stage_product = args.product
    if not args.previous_archive_prefix:
        args.previous_archive_prefix = args.archive_prefix
    args.archive_prefix = args.archive_prefix.rstrip("/")
    args.previous_archive_prefix = args.previous_archive_prefix.rstrip("/")
    args.mar_channel_id_overrides = {}
    for override in args.mar_channel_id_options:
        pattern, override_str = override.split(",", 1)
        args.mar_channel_id_overrides[pattern] = override_str
    return args


class UpdateVerifyConfigCreator:
    def __init__(self, config):
        self.config = config
        self.hgclient = None
        self.hg_tags = set()
        self.update_paths = {}
        self.update_verify_config = None

    def _setup_hgclient(self):
        if not self.config.get("local_repo"):
            return
        # Setup hgclient
        self.hgclient = hglib.open(self.config["local_repo"])
        try:
            self.hg_tags = set(t[0].decode("utf-8") for t in self.hgclient.tags())
            log.info(f"Loaded tags from local hg repo. {len(self.hg_tags)} tags found.")
        except Exception as e:
            log.info(f"Error loading tags from local hg repo: {e}")
            self.hg_tags = set()

    def _close_hg_client(self):
        if self.hgclient:
            self.hgclient.close()
            log.info("Closed HG client.")

    def _get_branch_url(self, branch_prefix, version):
        version = GeckoVersion.parse(version)
        branch = None
        if version.version_type == VersionType.BETA:
            branch = f"releases/{branch_prefix}-beta"
        elif version.version_type == VersionType.ESR:
            branch = f"releases/{branch_prefix}-esr{version.major_number}"
        elif version.version_type == VersionType.RELEASE:
            branch = f"releases/{branch_prefix}-release"
        if not branch:
            raise Exception("Cannot determine branch, cannot continue!")

        return branch

    async def _download_build_info(
        self, semaphore, session, product, version, info_file_url
    ):
        """Async download and parse build info file for given url

        Args:
            semaphore: Semaphore object to control max async parallel channels
            session: Http session handler
            product: Product string
            version: Version string
            info_file_url: URL to desired buildid file

        Returns:
            BuildInfo Tuple (product, version, buildID)
        """

        async def _get():
            async with session.get(info_file_url) as response:
                if response.status < 400:
                    return response.status, await response.text()
                return response.status, response.reason

        RETRIES = 3
        # Retry delay increase per attempt (5, 10, 15... seconds)
        RETRY_DELAY_STEP = 5
        async with semaphore:
            attempt = 1
            while attempt <= RETRIES:
                log.info(
                    f"Retrieving buildid from info file: {info_file_url} - attempt: #{attempt}"
                )
                status, text = await _get()
                if status < 400:
                    return BuildInfo(product, version, text.split("=")[1].strip())
                log.warning(
                    f"Error retrieving buildid {info_file_url} - Status: {status} - Reason: {text}"
                )
                if status == 404:
                    raise Exception(f"File not found on remote server: {info_file_url}")
                attempt += 1
                await asyncio.sleep(RETRY_DELAY_STEP * attempt)
            raise Exception(f"Max number of retries reached for {info_file_url}")

    def _async_download_build_ids(self, filelist):
        """Download all build_info asynchronously, then process once everything is downloaded

        Args:
            filelist: List of tuples (product, version, info_file_url)
        Returns:
            List of BuildInfo tuples (product, version, buildID)
        """
        CONCURRENCY = 15

        async def _run_semaphore():
            async with aiohttp.ClientSession() as session:
                log.info(
                    f"Starting async download. Semaphore with {CONCURRENCY} concurrencies."
                )
                semaphore = asyncio.Semaphore(CONCURRENCY)
                tasks = [
                    self._download_build_info(semaphore, session, *info)
                    for info in filelist
                ]
                return await asyncio.gather(*tasks)

        return asyncio.run(_run_semaphore())

    def _get_update_paths(self):
        self.update_paths = {}

        ret = retry_download(
            f"{self.config['product_details_server']}/1.0/{self.config['stage_product']}.json"
        )
        releases = json.load(ret)["releases"]
        info_file_urls = []
        # Generate list of info_file_urls to be downloaded
        for release_name, release_info in reversed(
            sorted(releases.items(), key=lambda x: MozillaVersion(x[1]["version"]))
        ):
            # we need to use releases_name instead of release_info since esr
            # string is included in the name. later we rely on this.
            product, version = release_name.split("-", 1)

            # Exclude any releases that don't match one of our include version
            # regexes. This is generally to avoid including versions from other
            # channels. Eg: including betas when testing releases
            for v in self.config["include_versions"]:
                if re.match(v, version):
                    break
            else:
                log.info(
                    "Skipping release whose version doesn't match any "
                    f"include_version pattern: {release_name}"
                )
                continue

            # We also have to trim out previous releases that aren't in the same
            # product line, too old, etc.
            if self.config["stage_product"] != product:
                log.info(
                    f"Skipping release that doesn't match product name: {release_name}"
                )
                continue
            if MozillaVersion(version) < MozillaVersion(self.config["last_watershed"]):
                log.info(
                    f"Skipping release that's behind the last watershed: {release_name}"
                )
                continue
            if version == self.config["to_version"]:
                log.info(
                    f"Skipping release that is the same as to version: {release_name}"
                )
                continue
            if MozillaVersion(version) > MozillaVersion(self.config["to_version"]):
                log.info(
                    f"Skipping release that's newer than to version: {release_name}"
                )
                continue

            # This is a crappy place to get buildids from, but we don't have a better one.
            # This will start to fail if old info files are deleted.
            candidates_dir = getCandidatesDir(
                self.config["stage_product"],
                version,
                release_info["build_number"],
            )
            info_file = ftp2infoFile(self.config["platform"])
            info_file_source = f"{self.config['previous_archive_prefix']}{candidates_dir}/{info_file}_info.txt"
            info_file_urls.append((product, version, info_file_source))

        build_info_list = self._async_download_build_ids(info_file_urls)

        for build in build_info_list:
            if build.version in self.update_paths:
                raise Exception(f"Found duplicate release for version: {build.version}")

            shipped_locales, app_version = self._get_files_from_repo_tag(
                build.product,
                build.version,
                f"{self.config['app_name']}/locales/shipped-locales",
                f"{self.config['app_name']}/config/version.txt",
            )
            log.info(f"Adding {build.version} to update paths")
            self.update_paths[build.version] = {
                "appVersion": app_version,
                "locales": getPlatformLocales(shipped_locales, self.config["platform"]),
                "buildID": build.buildID,
            }
            for pattern, mar_channel_ids in self.config[
                "mar_channel_id_overrides"
            ].items():
                if re.match(pattern, build.version):
                    self.update_paths[build.version]["marChannelIds"] = mar_channel_ids

    def _get_file_from_repo(self, rev, branch, path):
        if self.config.get("local_repo"):
            try:
                return self._get_files_from_local_repo(rev, path)[0]
            except Exception:
                log.info(
                    "Unable to get file from local repo, trying from remote instead."
                )
        return self._get_files_from_remote_repo(rev, branch, path)[0]

    def _get_files_from_repo_tag(self, product, version, *paths):
        tag = f"{product.upper()}_{version.replace('.', '_')}_RELEASE"
        if self.config.get("local_repo") and tag in self.hg_tags:
            return self._get_files_from_local_repo(tag, *paths)
        branch = self._get_branch_url(self.config["branch_prefix"], version)
        return self._get_files_from_remote_repo(tag, branch, *paths)

    def _get_files_from_local_repo(self, rev, *paths):
        """Retrieve multiple files from the local repo at a given revision"""
        # Given how slow hg is to retrieve files at specific revisions,
        #   the only performance improvement we can get is to cat multiple
        #   files and use a \\0 block separator. It's ugly, but it works.
        args = cmdbuilder(
            b"cat",
            *[bytes(p, "utf-8") for p in paths],
            cwd=self.config["local_repo"].encode("utf-8"),
            r=bytes(rev, "utf-8"),
            T=b"{path}\\0{data}\\0",
        )
        try:
            raw = self.hgclient.rawcommand(args).strip().decode("utf-8")
        except Exception as e:
            log.info("Error retrieving file from local repository.")
            raise e

        # The separator is added after every file data - so we need to remove the last one
        # Note that \\0 becomes \x00 (null) on the output side
        chunks = raw.split("\x00")[:-1]
        # The first line is the file path, so we map the path to contents
        path_contents = {}
        while chunks:
            filename = chunks.pop(0)
            data = chunks.pop(0).strip()
            path_contents[filename] = data

        # Result should be the same order as requested
        result = []
        for path in paths:
            if path not in path_contents:
                raise Exception(
                    f"_get_files_from_local_repo: Could not find {path} in revision {rev}"
                )
            result.append(path_contents[path])
        return result

    def _get_files_from_remote_repo(self, rev, branch, *paths):
        files = []
        for path in paths:
            hg_url = urljoin(
                self.config["hg_server"], f"{branch}/raw-file/{rev}/{path}"
            )
            # we're going to waste time retrying on 404s here...meh
            # at least we can lower sleep time to minimize that
            ret = retry_download(hg_url, sleeptime=5, max_sleeptime=5)
            # yep...errors are not raised! they're indicated by a `None`
            if ret is None:
                log.info("couldn't fetch file from hg; trying github")
                # this won't work for try most likely; that's okay, it's a short term hack!
                # possible problems:
                # - we get a non tag rev
                # - we get rate limited
                git_url = f"https://raw.githubusercontent.com/mozilla-firefox/firefox/refs/tags/{rev}/{path}"
                ret = retry_download(git_url)

            files.append(ret.read().strip().decode("utf-8"))
        return files

    def gather_info(self):
        self._get_update_paths()
        if self.update_paths:
            log.debug("Found update paths:")
            log.debug(pprint.pformat(self.update_paths))
        elif GeckoVersion.parse(self.config["to_version"]) <= GeckoVersion.parse(
            self.config["last_watershed"]
        ):
            log.warning(
                f"Didn't find any update paths, but to_version {self.config['to_version']} "
                f"is before the last_watershed {self.config['last_watershed']}, "
                "generating empty config"
            )
        else:
            raise SystemExit("Didn't find any update paths, cannot continue")

    def create_config(self):
        candidates_dir = getCandidatesDir(
            self.config["stage_product"],
            self.config["to_version"],
            self.config["to_build_number"],
        )
        to_ = getReleaseInstallerPath(
            self.config["product"],
            self.config["product"].title(),
            self.config["to_version"],
            self.config["platform"],
            locale="%locale%",
            last_linux_bz2_version=self.config.get("last_linux_bz2_version"),
        )
        to_path = f"{candidates_dir}/{to_}"

        to_display_version = self.config.get("to_display_version")
        if not to_display_version:
            to_display_version = getPrettyVersion(self.config["to_version"])

        self.update_verify_config = UpdateVerifyConfig(
            product=self.config["product"].title(),
            channel=self.config["channel"],
            aus_server=self.config["aus_server"],
            to=to_path,
            to_build_id=self.config["to_buildid"],
            to_app_version=self.config["to_app_version"],
            to_display_version=to_display_version,
            override_certs=self.config.get("override_certs"),
        )

        to_shipped_locales = self._get_file_from_repo(
            self.config["to_revision"],
            self.config["repo_path"],
            f"{self.config['app_name']}/locales/shipped-locales",
        )
        to_locales = set(
            getPlatformLocales(to_shipped_locales, self.config["platform"])
        )

        completes_only_index = 0
        for fromVersion in reversed(sorted(self.update_paths, key=CompareVersion)):
            from_ = self.update_paths[fromVersion]
            locales = sorted(list(set(from_["locales"]).intersection(to_locales)))
            appVersion = from_["appVersion"]
            build_id = from_["buildID"]
            mar_channel_IDs = from_.get("marChannelIds")

            # Use new build targets for Windows, but only on compatible
            #  versions (42+). See bug 1185456 for additional context.
            if self.config["platform"] not in ("win32", "win64") or LooseVersion(
                fromVersion
            ) < LooseVersion("42.0"):
                update_platform = ftp2updatePlatforms(self.config["platform"])[0]
            else:
                update_platform = ftp2updatePlatforms(self.config["platform"])[1]

            release_dir = getReleasesDir(self.config["stage_product"], fromVersion)
            path_ = getReleaseInstallerPath(
                self.config["product"],
                self.config["product"].title(),
                fromVersion,
                self.config["platform"],
                locale="%locale%",
                last_linux_bz2_version=self.config.get("last_linux_bz2_version"),
            )
            from_path = f"{release_dir}/{path_}"

            updater_path = getReleaseInstallerPath(
                self.config["product"],
                self.config["product"].title(),
                fromVersion,
                self.config["updater_platform"],
                locale="%locale%",
                last_linux_bz2_version=self.config.get("last_linux_bz2_version"),
            )
            updater_package = f"{release_dir}/{updater_path}"

            # Exclude locales being full checked
            quick_check_locales = [
                l for l in locales if l not in self.config["full_check_locales"]
            ]
            # Get the intersection of from and to full_check_locales
            this_full_check_locales = [
                l for l in self.config["full_check_locales"] if l in locales
            ]

            if fromVersion in self.config["partial_versions"]:
                log.info(
                    f"Generating configs for partial update checks for {fromVersion}"
                )
                self.update_verify_config.addRelease(
                    release=appVersion,
                    build_id=build_id,
                    locales=locales,
                    patch_types=["complete", "partial"],
                    from_path=from_path,
                    ftp_server_from=self.config["previous_archive_prefix"],
                    ftp_server_to=self.config["archive_prefix"],
                    mar_channel_IDs=mar_channel_IDs,
                    platform=update_platform,
                    updater_package=updater_package,
                )
            else:
                if this_full_check_locales and is_triangular(completes_only_index):
                    log.info(f"Generating full check configs for {fromVersion}")
                    self.update_verify_config.addRelease(
                        release=appVersion,
                        build_id=build_id,
                        locales=this_full_check_locales,
                        from_path=from_path,
                        ftp_server_from=self.config["previous_archive_prefix"],
                        ftp_server_to=self.config["archive_prefix"],
                        mar_channel_IDs=mar_channel_IDs,
                        platform=update_platform,
                        updater_package=updater_package,
                    )
                # Quick test for other locales, no download
                if len(quick_check_locales) > 0:
                    log.info(f"Generating quick check configs for {fromVersion}")
                    if not is_triangular(completes_only_index):
                        # Assuming we skipped full check locales, using all locales
                        _locales = locales
                    else:
                        # Excluding full check locales from the quick check
                        _locales = quick_check_locales
                    self.update_verify_config.addRelease(
                        release=appVersion,
                        build_id=build_id,
                        locales=_locales,
                        platform=update_platform,
                    )
                completes_only_index += 1

    def write_config(self):
        # Needs to be opened in "bytes" mode because we perform relative seeks on it
        with open(self.config["output_file"], "wb+") as fh:
            self.update_verify_config.write(fh)

    def run(self):
        self._setup_hgclient()
        try:
            self.gather_info()
            self.create_config()
            self.write_config()
        finally:
            self._close_hg_client()


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
    args = parse_args(argv)
    UpdateVerifyConfigCreator(vars(args)).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
