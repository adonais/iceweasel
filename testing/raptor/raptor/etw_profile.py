# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

from logger.logger import RaptorLogger
from raptor_profiling import RaptorProfiling

LOG = RaptorLogger(component="raptor-etw-profile")

XPERF_START_TASK = "xperf_kernel_trace_start"
XPERF_STOP_TASK = "xperf_kernel_trace_stop"
XPERF_ETL_RELATIVE = Path("xperf", "combined.etl")
XPERF_ETL_KERNEL_SESSION_RELATIVE = Path("xperf", "kernel_session.etl")
XPERF_ETL_USER_SESSION_RELATIVE = Path("xperf", "user_session.etl")
XPERF_STARTUP_TIME = 2
SCHTASKS_POLL_INTERVAL = 1
SCHTASKS_POLL_TIMEOUT = 450
SCHTASKS_RUN_TIMEOUT = 30
SAMPLY_TIMEOUT = 900


class ETWProfile(RaptorProfiling):
    """Record kernel ETW traces (.etl) using xperf (via pre-configured
    scheduled tasks), then use Samply to convert and symbolicate them
    into profiles in the Firefox Profiler JSON format.

    On the Windows pool, scheduled tasks allow an
    unprivileged user to start/stop xperf kernel tracing/profiling:

        schtasks /run /tn xperf_kernel_trace_start
        schtasks /run /tn xperf_kernel_trace_stop

    The resulting ETL trace is written to:

        %USERPROFILE%\\xperf\\combined.etl

    The implementation of these tasks can be found here:
    https://github.com/mozilla-platform-ops/ronin_puppet/tree/master/modules/win_hw_profiling

    """

    def __init__(self, upload_dir, raptor_config, test_config):
        super().__init__(upload_dir, raptor_config, test_config)

        self.test_name = self.test_config.get("name", "test")

        self.etl_source = Path(os.environ["USERPROFILE"]) / XPERF_ETL_RELATIVE
        self.etl_kernel_session_path = (
            Path(os.environ["USERPROFILE"]) / XPERF_ETL_KERNEL_SESSION_RELATIVE
        )
        self.etl_user_session_path = (
            Path(os.environ["USERPROFILE"]) / XPERF_ETL_USER_SESSION_RELATIVE
        )
        self.upload_dir = Path(self.upload_dir)
        self.profile = (
            self.upload_dir / f"profile_etw_{self.test_name}_unprocessed.json.gz"
        )

        # Temporary working directory for intermediate files
        self.temp_dir = Path(tempfile.mkdtemp())

        self.running = False

        if not self.raptor_config.get("run_local"):
            moz_fetch = Path(os.environ["MOZ_FETCHES_DIR"])
            self.samply_path = moz_fetch / "samply" / "samply.exe"

        LOG.info(f"ETW profiling initialized: etl_source={self.etl_source}")
        for key, value in self.__dict__.items():
            LOG.debug(f"attribute: {key}={value}")
        for key, value in raptor_config.items():
            LOG.debug(f"raptor config: {key}={value}")
        for key, value in test_config.items():
            LOG.debug(f"test config: {key}={value}")

    def _run_schtask(self, task_name):
        cmd = ["schtasks", "/run", "/tn", task_name]
        LOG.info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=SCHTASKS_RUN_TIMEOUT,
            check=False,
        )
        if result.returncode != 0:
            LOG.error(f"schtasks failed (rc={result.returncode}): {result.stderr}")
            raise RuntimeError(f"schtasks /run /tn {task_name} failed")
        LOG.info(f"schtasks output: {result.stdout.strip()}")

    def _wait_for_combined_etl(self, timeout=SCHTASKS_POLL_TIMEOUT):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.etl_source.exists():
                time.sleep(1)
                size = self.etl_source.stat().st_size
                if size > 0:
                    LOG.info(f"ETL file ready: {self.etl_source} ({size} bytes)")
                    return True
            time.sleep(SCHTASKS_POLL_INTERVAL)
        LOG.error(f"ETL file not found after {timeout}s: {self.etl_source}")
        return False

    def start(self):
        if self.etl_source.exists():
            size = self.etl_source.stat().st_size
            self.etl_source.unlink()
            LOG.info(
                f"Removed stale combined ETL file: {self.etl_source} ({size} bytes)"
            )
        if self.etl_kernel_session_path.exists():
            size = self.etl_kernel_session_path.stat().st_size
            self.etl_kernel_session_path.unlink()
            LOG.info(f"Removed stale kernel ETL file ({size} bytes)")
        if self.etl_user_session_path.exists():
            size = self.etl_user_session_path.stat().st_size
            self.etl_user_session_path.unlink()
            LOG.info(f"Removed stale user ETL file ({size} bytes)")

        self._run_schtask(XPERF_START_TASK)
        self.running = True
        time.sleep(XPERF_STARTUP_TIME)
        LOG.info("ETW (xperf) profiling has started")
        return True

    def stop(self):
        if not self.running:
            LOG.error("No xperf session is running")
            return False

        self._run_schtask(XPERF_STOP_TASK)
        self.running = False
        LOG.info("ETW (xperf) profiling has stopped")
        return True

    def upload_etl(self, debug=False):
        if debug:
            if self.etl_kernel_session_path.exists():
                etl_kernel_dest = self.upload_dir / f"xperf-kernel-{self.test_name}.etl"
                shutil.copy2(self.etl_kernel_session_path, etl_kernel_dest)
                LOG.info(f"Kernel ETL archived to: {etl_kernel_dest}")

            if self.etl_user_session_path.exists():
                etl_user_dest = self.upload_dir / f"xperf-user-{self.test_name}.etl"
                shutil.copy2(self.etl_user_session_path, etl_user_dest)
                LOG.info(f"User ETL archived to: {etl_user_dest}")

        # Kernel and user ETL files need to finish merging
        # before the combined ETL can be uploaded
        self._wait_for_combined_etl()
        if self.etl_source.exists():
            etl_dest = self.upload_dir / f"xperf-combined-{self.test_name}.etl"
            shutil.move(self.etl_source, etl_dest)
            LOG.info(f"Combined ETL archived to: {etl_dest}")

    def symbolicate(self):
        if not self.etl_kernel_session_path.exists():
            LOG.error(f"Cannot find kernel ETL file: {self.etl_kernel_session_path}")
            return False

        if not self.etl_user_session_path.exists():
            LOG.error(f"Cannot find user ETL file: {self.etl_user_session_path}")
            return False

        samply_cmd = [
            str(self.samply_path),
            "import",
            str(self.etl_kernel_session_path),
            str(self.etl_user_session_path),
            "--save-only",
            "-o",
            str(self.profile),
            "--presymbolicate",
            "--breakpad-symbol-server",
            "https://symbols.mozilla.org/",
        ]

        moz_fetch = Path(os.environ["MOZ_FETCHES_DIR"])
        if (
            self.raptor_config.get("app", "") == "custom-car"
            and (moz_fetch / "chromium" / "Default").exists()
        ):
            symbol_dir = moz_fetch / "chromium" / "Default"
            samply_cmd.extend(["--symbol-dir", str(symbol_dir)])
        elif (moz_fetch / "target.crashreporter-symbols.zip").exists():
            symbol_dir = self.temp_dir / "target.crashreporter-symbols"
            breakpad_symbol_zip = moz_fetch / "target.crashreporter-symbols.zip"
            LOG.info(f"Unzipping {breakpad_symbol_zip}")
            with zipfile.ZipFile(breakpad_symbol_zip, "r") as zipf:
                zipf.extractall(symbol_dir)
            samply_cmd.extend(["--breakpad-symbol-dir", str(symbol_dir)])
        else:
            LOG.error("Symbols artifact not found.")

        LOG.info(f"Running: {' '.join(samply_cmd)}")
        result = subprocess.run(
            samply_cmd,
            capture_output=True,
            text=True,
            timeout=SAMPLY_TIMEOUT,
            check=False,
        )
        for line in result.stdout.splitlines():
            LOG.info(f"samply stdout: {line}")
        for line in result.stderr.splitlines():
            LOG.info(f"samply stderr: {line}")
        if result.returncode != 0:
            LOG.error(f"samply exited with code {result.returncode}")
            return False
        if not self.profile.exists():
            LOG.error(f"samply did not produce a profile at {self.profile}")
            return False

        size = self.profile.stat().st_size
        LOG.info(f"Profile symbolicated: {self.profile} ({size} bytes)")

        return True

    def clean(self):
        if self.etl_kernel_session_path.exists():
            self.etl_kernel_session_path.unlink()
            LOG.info("Cleaned up kernel ETL file")

        if self.etl_user_session_path.exists():
            self.etl_user_session_path.unlink()
            LOG.info("Cleaned up user ETL file")

        if self.temp_dir and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)
            LOG.info("Cleaned up temporary working directory")

        # RaptorProfiling creates temp_profile_dir in __init__
        # for storing profile data. Clean it up here to avoid resource leaks.
        super().clean()
