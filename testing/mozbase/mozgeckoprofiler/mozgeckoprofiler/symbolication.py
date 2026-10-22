# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import atexit
import os
import platform
import shutil
import signal
import subprocess
import tempfile
import time
import zipfile
from functools import cache
from pathlib import Path
from urllib.parse import unquote

from mozlog import get_proxy_logger

try:
    from mozbuild.base import MozbuildObject
except ImportError:
    MozbuildObject = None

LOG = get_proxy_logger("profiler")
BREAKPAD_SYMBOL_SERVER = "https://symbols.mozilla.org/"
SYMBOL_SERVER_TIMEOUT = 60  # seconds
SAMPLY_WAIT_TIMEOUT = 60  # seconds


@cache
def get_extracted_symbols():
    """Return a directory of Breakpad symbols, or None if there is none.

    The result is computed once per process. In automation the symbols zip is
    unpacked into a temporary directory that this module owns and removes at
    exit, so a task that symbolicates several profiles unpacks it once.
    """
    try:
        if "MOZ_AUTOMATION" in os.environ:
            base_path = os.environ["MOZ_FETCHES_DIR"]
            symbol_zip = Path(base_path) / "target.crashreporter-symbols.zip"
            if symbol_zip.exists():
                breakpad_symbol_dir = Path(tempfile.mkdtemp(prefix="breakpad_symbols"))
                atexit.register(shutil.rmtree, breakpad_symbol_dir, ignore_errors=True)
                with zipfile.ZipFile(symbol_zip, "r") as zipf:
                    zipf.extractall(breakpad_symbol_dir)
                LOG.info(f"Extracted symbols to {breakpad_symbol_dir}")
                return breakpad_symbol_dir
            LOG.warning("Symbol directory not found.")
        else:
            if "MOZ_DEVELOPER_OBJ_DIR" in os.environ:
                objdir_symbols = (
                    Path(os.environ["MOZ_DEVELOPER_OBJ_DIR"])
                    / "dist"
                    / "crashreporter-symbols"
                )
                if objdir_symbols.is_dir():
                    LOG.info(
                        f"Returning symbol_dir from MOZ_DEVELOPER_OBJ_DIR: {objdir_symbols}"
                    )
                    return objdir_symbols

            if MozbuildObject is not None:
                moz_obj = MozbuildObject.from_environment()
                objdir_symbols = Path(moz_obj.distdir) / "crashreporter-symbols"
                if objdir_symbols.is_dir():
                    LOG.info(
                        f"Returning symbol_dir from MozbuildObject: {objdir_symbols}"
                    )
                    return objdir_symbols

            LOG.warning(
                "Symbol directory not found. Try running: ./mach build and ./mach buildsymbols"
            )

        return None
    except Exception as e:
        LOG.error(f"Error extracting or finding symbols: {e}", exc_info=True)
        return None


def _validate_symbolication_deps(paths_to_validate):
    for dep_path in paths_to_validate:
        if not dep_path.exists():
            LOG.warning(f"{dep_path} does not exist.")
            return False
    return True


def symbolicate_profile_file(in_path, out_path, symbol_dir=None):
    """Symbolicate a Gecko profile, using samply and profiler-edit.

    The profile is never read into this process: both tools work on file paths,
    and profiler-edit writes out_path with the compression that its extension
    implies (gzipped when the name ends in ".gz", plain otherwise).

    Args:
        in_path (path): The profile to symbolicate. Gzipped when its name
            ends in ".gz", plain otherwise, which is how samply reads it.
        out_path (path): Where to write the symbolicated profile. Removed
            again if symbolication fails, so that a partial profile is never
            left behind.
        symbol_dir (path): Directory of Breakpad symbols to use. When omitted,
            it is looked up with get_extracted_symbols().

    Returns:
        bool: Whether a complete symbolicated profile was written to out_path.
    """

    # Check if running in CI
    if "MOZ_AUTOMATION" in os.environ:
        base_path = os.environ["MOZ_FETCHES_DIR"]
    else:
        base_path = os.environ.get(
            "MOZBUILD_STATE_PATH", str(Path.home() / ".mozbuild")
        )

    profiler_edit_path = Path(base_path, "profiler-node-tools", "profiler-edit.js")
    if platform.system() == "Windows":
        samply_path = Path(base_path, "samply", "samply.exe")
        node_path = Path(base_path, "node", "node.exe")
    else:
        samply_path = Path(base_path, "samply", "samply")
        node_path = Path(base_path, "node", "bin", "node")

    # Check if symbolication dependencies are available
    if not _validate_symbolication_deps([
        profiler_edit_path,
        samply_path,
        node_path,
    ]):
        LOG.info("Symbolication dependencies not available, skipping symbolication.")
        return False

    out_path = Path(out_path)
    try:
        if symbol_dir is None:
            symbol_dir = get_extracted_symbols()
            if symbol_dir is None:
                LOG.warning(
                    f"Symbol directory not found. Attempting to symbolicate with {BREAKPAD_SYMBOL_SERVER}"
                )

        # Load the unsymbolicated profile with samply, which serves the symbols
        # that profiler-edit then asks for. samply needs the profile itself: it
        # resolves requests that don't carry a debugName and breakpadId through
        # the library paths recorded in it.
        samply_cmd = [
            samply_path,
            "load",
            str(in_path),
            "--no-open",
        ]
        if symbol_dir:
            samply_cmd.extend([
                "--breakpad-symbol-dir",
                str(symbol_dir),
            ])
        samply_cmd.extend([
            "--breakpad-symbol-server",
            BREAKPAD_SYMBOL_SERVER,
        ])

        LOG.info(f"Running samply command: {samply_cmd}")
        samply_process = subprocess.Popen(
            samply_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        try:
            # Tail output for timeout seconds to obtain symbol server url
            server_url = ""
            start = time.time()
            with samply_process.stdout:
                for line in iter(samply_process.stdout.readline, ""):
                    if line.startswith("http"):
                        url = unquote(line)
                        server_url = str(url.split("symbolServer=", 1)[-1])
                        break
                    timeout = time.time() - start
                    if timeout > SYMBOL_SERVER_TIMEOUT:
                        raise TimeoutError(
                            f"Server timed out after exceeding {SYMBOL_SERVER_TIMEOUT} seconds. Time elapsed : {timeout} seconds."
                        )

            if not server_url:
                raise RuntimeError(
                    "samply exited without reporting a symbol server URL."
                )

            profiler_edit_cmd = [
                node_path,
                "--max-old-space-size=8192",
                str(profiler_edit_path),
                "-i",
                str(in_path),
                "-o",
                str(out_path),
                "--symbolicate-with-server",
                server_url,
            ]
            LOG.info(f"Running profiler-edit command: {profiler_edit_cmd}")
            with subprocess.Popen(
                profiler_edit_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            ) as profiler_edit_process:
                for line in profiler_edit_process.stdout:
                    LOG.info(f"profiler-edit {line.strip()}")
        finally:
            if platform.system() == "Windows":
                samply_process.terminate()
            else:
                samply_process.send_signal(signal.SIGINT)  # ctrl-c shutdown

            try:
                samply_process.wait(timeout=SAMPLY_WAIT_TIMEOUT)
            except subprocess.TimeoutExpired:
                samply_process.kill()
                samply_process.wait()

        # Check the return code - only checking for the file existence is not enough,
        # because a terminated profiler-edit process (e.g. due to out-of-memory) may
        # leave a partial file behind.
        if profiler_edit_process.returncode != 0:
            raise RuntimeError(
                f"profiler-edit exited with status {profiler_edit_process.returncode}."
            )

        return out_path.exists()

    except Exception:
        # Log a warning.
        # This is a warning and not an error because we don't want to fail a job whose
        # tests passed, just because we failed to symbolicate the profile.
        LOG.warning(
            "Profile symbolication with Samply and profiler-edit failed.",
            exc_info=True,
        )
        out_path.unlink(missing_ok=True)
        return False
