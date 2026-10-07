# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import gzip
import json
import os
import platform
import signal
import subprocess
import tempfile
import time
import zipfile
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


def get_extracted_symbols(work_dir=None):
    try:
        if "MOZ_AUTOMATION" in os.environ:
            base_path = os.environ["MOZ_FETCHES_DIR"]
            symbol_zip = Path(base_path) / "target.crashreporter-symbols.zip"
            if symbol_zip.exists():
                if work_dir is None:
                    raise ValueError(
                        "work_dir must be provided in MOZ_AUTOMATION environment"
                    )
                breakpad_symbol_dir = Path(work_dir) / "breakpad_symbols"
                breakpad_symbol_dir.mkdir(exist_ok=True)
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


def symbolicate_profile(profile_json, symbol_dir=None):
    """Symbolicate a Gecko profile in place, using samply and profiler-edit.

    Args:
        profile_json (dict): The profile to symbolicate, mutated in place.
        symbol_dir (path): Directory of Breakpad symbols to use. When omitted,
            it is looked up with get_extracted_symbols().
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
        return

    try:
        with tempfile.TemporaryDirectory() as work_dir:
            if symbol_dir is None:
                symbol_dir = get_extracted_symbols(work_dir)
                if symbol_dir is None:
                    LOG.warning(
                        f"Symbol directory not found. Attempting to symbolicate with {BREAKPAD_SYMBOL_SERVER}"
                    )

            unsym_profile = Path(work_dir, "unsym_profile.json")
            unsym_profile.write_text(
                json.dumps(profile_json, ensure_ascii=False), encoding="utf-8"
            )
            sym_profile = Path(work_dir) / "sym_profile.json.gz"

            # Load unsymbolicated profile with samply
            samply_cmd = [
                samply_path,
                "load",
                str(unsym_profile),
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

            profiler_edit_cmd = [
                node_path,
                "--max-old-space-size=8192",
                str(profiler_edit_path),
                "-i",
                str(unsym_profile),
                "-o",
                str(sym_profile),
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

            # Terminate samply server
            if platform.system() == "Windows":
                samply_process.terminate()
            else:
                samply_process.send_signal(signal.SIGINT)  # ctrl-c shutdown

            samply_process.wait(timeout=SAMPLY_WAIT_TIMEOUT)

            if sym_profile.exists():
                # Load profile json into memory and mutate profile
                is_gzipped = False
                with sym_profile.open("rb") as f:
                    gzip_magic_number = b"\x1f\x8b"
                    if f.read(2) == gzip_magic_number:
                        is_gzipped = True

                if is_gzipped:
                    with gzip.open(sym_profile, "rt", encoding="utf-8") as f:
                        sym = json.load(f)
                else:
                    with sym_profile.open("r", encoding="utf-8") as f:
                        sym = json.load(f)

                profile_json.clear()
                profile_json.update(sym)

    except Exception:
        LOG.critical(
            "Profile symbolication with Samply and profiler-edit failed.",
            exc_info=True,
        )
