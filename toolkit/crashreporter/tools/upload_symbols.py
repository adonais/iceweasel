#!/usr/bin/env python3
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# This script uploads a symbol archive file from a path or URL passed on the commandline
# to the symbol server at https://symbols.mozilla.org/ .
#
# Using this script requires you to have generated an authentication
# token in the symbol server web interface. You must store the token in a Taskcluster
# secret as the JSON blob `{"token": "<token>"}` and set the `SYMBOL_SECRET`
# environment variable to the name of the Taskcluster secret. Alternately,
# you can put the token in a file and set `SOCORRO_SYMBOL_UPLOAD_TOKEN_FILE`
# environment variable to the path to the file.

import argparse
import logging
import os
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from urllib import parse

import redo
import requests

log = logging.getLogger("upload-symbols")
log.setLevel(logging.INFO)

DEFAULT_URL = "https://symbols.mozilla.org/"
TASKCLUSTER_PROXY_URL = os.environ.get("TASKCLUSTER_PROXY_URL", "http://taskcluster")
TASKCLUSTER_ROOT_URL = os.environ.get(
    "TASKCLUSTER_ROOT_URL", "https://firefox-ci-tc.services.mozilla.com"
)
MAX_RETRIES = 7
MAX_ZIP_SIZE = 500000000  # 500 MB


def print_error(r):
    if r.status_code < 400:
        log.error(f"Error: bad auth token? ({r.status_code}: {r.reason})")
    else:
        log.error(f"Error: got HTTP response {r.status_code}: {r.reason}")

    log.error(
        "Response body:\n{sep}\n{body}\n{sep}\n".format(sep="=" * 20, body=r.text)
    )


def get_taskcluster_secret(secret_name):
    secrets_url = f"{TASKCLUSTER_PROXY_URL}/secrets/v1/secret/{secret_name}"
    log.info(f'Using symbol upload token from the secrets service: "{secrets_url}"')
    res = requests.get(secrets_url)
    res.raise_for_status()
    secret = res.json()
    auth_token = secret["secret"]["token"]

    return auth_token


def get_taskcluster_artifact_urls(task_id):
    artifacts_url = f"{TASKCLUSTER_PROXY_URL}/queue/v1/task/{task_id}/artifacts"
    res = requests.get(artifacts_url)
    res.raise_for_status()
    return [
        "{}/api/queue/v1/task/{}/artifacts/{}".format(
            TASKCLUSTER_ROOT_URL, task_id, artifact["name"]
        )
        for artifact in res.json()["artifacts"]
        if artifact["name"].startswith("public/build/target.crashreporter-symbols")
    ]


def main():
    logging.basicConfig()
    parser = argparse.ArgumentParser(
        description="Upload symbols using token from Taskcluster secrets service."
    )
    parser.add_argument(
        "archive",
        help="Symbols archive file - URL or path to local file",
        nargs="*",
    )
    parser.add_argument(
        "--ignore-missing", help="No error on missing files", action="store_true"
    )
    parser.add_argument("--task-id", help="Taskcluster task id to use symbols from")
    args = parser.parse_args()

    def check_file_exists(url):
        for i, _ in enumerate(redo.retrier(attempts=MAX_RETRIES), start=1):
            try:
                resp = requests.head(url, allow_redirects=True)
                return resp.status_code == requests.codes.ok
            except requests.exceptions.RequestException as e:
                log.error(f"Error: {e}")
            log.info("Retrying...")
        return False

    if args.task_id:
        args.archive.extend(get_taskcluster_artifact_urls(args.task_id))

    for archive in args.archive:
        error = False
        if archive.startswith("http"):
            is_existing = check_file_exists(archive)
        else:
            is_existing = os.path.isfile(archive)

        if not is_existing:
            if args.ignore_missing:
                log.info(f'Archive file "{args.archive}" does not exist!')
            else:
                log.error(f'Error: archive file "{args.archive}" does not exist!')
                error = True
        if error:
            return 1

    with tempfile.TemporaryDirectory() as tmpdir:
        unpack_zst_archives(args.archive, tmpdir)
        return upload_symbols(tmpdir)


def download_archive(archive):
    output_filename = parse.urlsplit(archive).path.rpartition("/")[2]
    output_path = os.path.join(tempfile.gettempdir(), output_filename)
    log.info(f"Downloading archive {archive}...")
    with requests.get(archive, stream=True) as response:
        response.raise_for_status()
        with open(output_path, "wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    output.write(chunk)
    return output_path


def unpack_zst_archives(archives, tmpdir):
    for archive in archives:
        if archive.endswith(".tar.zst"):
            unpack_zst_archive(archive, tmpdir)
        elif archive.startswith("http"):
            # This is a ZIP archive URL. We used to directly pass the URL to the
            # Symbols Server, which would download the archive and process it. In
            # the upcoming version of the upload API, symbols file data no longer
            # passes through the Symbols Server, so we need to download the archive
            # to the local disk. ZIP archives need to be seekable to be unpacked,
            # since the central directory is stored near the end of the archive.
            local_archive = download_archive(archive)
            zipfile.ZipFile(local_archive).extractall(tmpdir)
            os.unlink(local_archive)
        else:
            zipfile.ZipFile(archive).extractall(tmpdir)


def unpack_zst_archive(zst_archive, tmpdir):
    """
    Unpack a .tar.zst file to a temporary directory.

    Our build tasks output .tar.zst files, but the upload-symbols command-line tool
    expects a directory of symbols files as input.

    :param zst_archive: path or URL to a .tar.zst source file
    :param tmpdir: Path to the temporary directory to extract the symbols files to
    """
    import concurrent.futures
    import gzip

    import zstandard

    def iter_files_from_tar(reader, desc="reader"):
        ctx = zstandard.ZstdDecompressor()
        uncompressed = ctx.stream_reader(reader)
        with tarfile.open(mode="r|", fileobj=uncompressed, bufsize=1024 * 1024) as tar:
            while True:
                info = tar.next()
                if info is None:
                    break
                file = tar.extractfile(info)
                if file:
                    data = file.read()
                    yield (info.name, data)
                else:
                    log.warning(
                        "Tarball entry from %s is not a file: `%s`", desc, info.name
                    )

    def prepare_from(archive, tmpdir):
        reader_desc = None
        if archive.startswith("http"):
            resp = requests.get(archive, allow_redirects=True, stream=True)
            resp.raise_for_status()
            reader = resp.raw
            # Work around taskcluster generic-worker possibly gzipping the tar.zst.
            if resp.headers.get("Content-Encoding") == "gzip":
                reader = gzip.GzipFile(fileobj=reader)
            reader_desc = f"stream `{archive}`"
        else:
            reader = open(archive, "rb")
            reader_desc = f"file `{archive}`"

        def handle_file(data):
            """
            For a given pair of (file_name, bytes_data), return a pair
            of (compressed_file_name, mozpack.files.File-like) or
            (file_name, None) when the file can't be compressed.
            """
            name, data = data
            log.info("Handling %s", name)
            path = os.path.join(tmpdir, name.lstrip("/"))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            if name.endswith(".dbg"):
                with open(path + ".gz", "wb") as fh:
                    with gzip.GzipFile(fileobj=fh, mode="wb", compresslevel=5) as c:
                        c.write(data)
            elif name.endswith(".dSYM.tar"):
                import bz2

                with bz2.open(path + ".bz2", "wb") as fh:
                    fh.write(data)
            elif name.endswith((".pdb", ".exe", ".dll")):
                # The CAB format doesn't support files larger than 2GB.
                # Skipping the file is still better than failing the entire
                # upload.
                if len(data) >= 0x7FFF8000:
                    log.info("Skipping %s", name)
                    return

                makecab = os.environ.get("MAKECAB", "makecab")
                with open(path, "wb") as fh:
                    fh.write(data)

                subprocess.check_call(
                    [makecab, "-D", "CompressionType=MSZIP", path, path[:-1] + "_"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.STDOUT,
                )
                os.unlink(path)
            else:
                with open(path, "wb") as fh:
                    fh.write(data)

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=os.cpu_count()
        ) as executor:
            # Consume the iterator to propagate exceptions
            for _ in executor.map(
                handle_file, iter_files_from_tar(reader, desc=reader_desc)
            ):
                pass

        reader.close()

    log.info(f'Extracting symbols files from "{zst_archive}"')
    for i, _ in enumerate(redo.retrier(attempts=MAX_RETRIES), start=1):
        try:
            prepare_from(zst_archive, tmpdir)
            return
        except requests.exceptions.RequestException as e:
            log.error(f"Error: {e}")
            log.info("Retrying...")


def upload_symbols(directory):
    """
    Upload symbols to the tecken server

    :param directory: path to the directory of symbols files to upload
    :returns: 0 indicates the upload was successful, non-zero indicates an
              error that should be used for the script's exit code
    """
    secret_name = os.environ.get("SYMBOL_SECRET")
    if secret_name is not None:
        auth_token = get_taskcluster_secret(secret_name)
    elif "SOCORRO_SYMBOL_UPLOAD_TOKEN_FILE" in os.environ:
        token_file = os.environ["SOCORRO_SYMBOL_UPLOAD_TOKEN_FILE"]

        if not os.path.isfile(token_file):
            log.error(
                f'SOCORRO_SYMBOL_UPLOAD_TOKEN_FILE "{token_file}" does not exist!'
            )
            return 1
        auth_token = open(token_file).read().strip()
    else:
        log.error(
            "You must set the SYMBOL_SECRET or SOCORRO_SYMBOL_UPLOAD_TOKEN_FILE "
            "environment variables!"
        )
        return 1

    # Allow overwriting of the upload url with an environmental variable
    if "SOCORRO_SYMBOL_UPLOAD_URL" in os.environ:
        url = os.environ["SOCORRO_SYMBOL_UPLOAD_URL"]
        if url.endswith("upload/"):
            # The URL used to be the full path to the upload endpoint. Now the URL is
            # the base URL of the Symbols Server. For backwards compatibility, remove
            # the endpoint path to the old upload endpoint.
            url = url.removesuffix("upload/")
            log.warning(f"SOCORRO_SYMBOL_UPLOAD_URL should be set to {url}.")
    else:
        url = DEFAULT_URL

    os.environ["SYMBOLS_AUTH_TOKEN"] = auth_token
    upload_symbols = os.environ.get("UPLOAD_SYMBOLS", "upload-symbols")
    status = subprocess.run(
        [upload_symbols, "--server-url", url, directory], check=False
    )
    return status.returncode


if __name__ == "__main__":
    sys.exit(main())
