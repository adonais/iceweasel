# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import json
import os
import platform
import signal
import socket
import sys
import time

import mozinfo
from mozprocess import ProcessHandler

from mozproxy.backends.base import Playback
from mozproxy.recordings import RecordingFile
from mozproxy.utils import (
    LOG,
    download_file_from_url,
    get_available_port,
    tooltool_download,
    transform_platform,
)

here = os.path.dirname(__file__)
mitm_folder = os.path.dirname(os.path.realpath(__file__))

# maximal allowed runtime of a mitmproxy command
MITMDUMP_COMMAND_TIMEOUT = 30


class Mitmproxy(Playback):
    def __init__(self, config):
        self.config = config
        # Register signal handlers to cleanup mitmdump on interrupt
        if not self._is_test_environment():
            self._register_signals()

        self.host = (
            "127.0.0.1" if "localhost" in self.config["host"] else self.config["host"]
        )
        self.port = None
        self.mitmproxy_proc = None
        self.mitmdump_path = None
        self.mitmdump_path_dir = None
        self.record_mode = config.get("record", False)
        self.recording = None
        self.playback_files = []

        self.browser_path = ""
        if config.get("binary", None):
            self.browser_path = os.path.normpath(config.get("binary"))

        self.policies_dir = None
        self.ignore_mitmdump_exit_failure = config.get(
            "ignore_mitmdump_exit_failure", False
        )

        if self.record_mode:
            if "recording_file" not in self.config:
                LOG.error(
                    "recording_file value was not provided. Proxy service wont' start "
                )
                raise Exception("Please provide a playback_files list.")

            if not isinstance(self.config.get("recording_file"), str):
                LOG.error("recording_file argument type is not str!")
                raise Exception("recording_file argument type invalid!")

            if not os.path.splitext(self.config.get("recording_file"))[1] == ".zip":
                LOG.error(
                    f"Recording file type ({self.config.get('recording_file')}) should be a zip. "
                    "Please provide a valid file type!"
                )
                raise Exception("Recording file type should be a zip")

            if os.path.exists(self.config.get("recording_file")):
                LOG.error(
                    f"Recording file ({self.config.get('recording_file')}) already exists. "
                    "Please provide a valid file path!"
                )
                raise Exception("Recording file already exists.")

            if self.config.get("playback_files", False):
                LOG.error("Record mode is True and playback_files where provided!")
                raise Exception("playback_files specified during record!")

        if self.config.get("playback_version") is None:
            LOG.error(
                "mitmproxy was not provided with a 'playback_version' "
                "Please provide a valid playback version"
            )
            raise Exception("playback_version not specified!")

        # mozproxy_dir is where we will download all mitmproxy required files
        # when running locally it comes from obj_path via mozharness/mach
        if self.config.get("obj_path") is not None:
            self.mozproxy_dir = self.config.get("obj_path")
            self.upload_dir = os.environ.get("MOZ_UPLOAD_DIR", self.mozproxy_dir)
        else:
            # in production it is ../tasks/task_N/build/, in production that dir
            # is not available as an envvar, however MOZ_UPLOAD_DIR is set as
            # ../tasks/task_N/build/blobber_upload_dir so take that and go up 1 level
            self.mozproxy_dir = os.path.dirname(
                os.path.dirname(os.environ["MOZ_UPLOAD_DIR"])
            )

            # Set the upload dir to the internal storage
            self.upload_dir = os.environ.get("MOZ_INTERNAL_UPLOAD_DIR")

        self.mozproxy_dir = os.path.join(self.mozproxy_dir, "testing", "mozproxy")

        LOG.info(
            f"mozproxy_dir used for mitmproxy downloads and exe files: {self.mozproxy_dir}"
        )
        # setting up the MOZPROXY_DIR env variable so custom scripts know
        # where to get the data
        os.environ["MOZPROXY_DIR"] = self.mozproxy_dir

        LOG.info(f"Playback tool: {self.config['playback_tool']}")
        LOG.info(f"Playback tool version: {self.config['playback_version']}")

    def _is_test_environment(self):
        """Check if running under pytest.

        Signal handlers are skipped during tests since they call sys.exit()
        which would kill the test runner. Tests also mock processes and send
        signals deliberately for testing.
        """
        return (
            "pytest" in sys.modules or os.environ.get("PYTEST_CURRENT_TEST") is not None
        )

    def _register_signals(self):
        """Register signal handlers for cleanup.

        SIGINT: Ctrl+C from terminal
        SIGTERM: kill command
        SIGHUP: terminal closed/SSH disconnected (Unix only)
        """
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)
        if hasattr(signal, "SIGHUP"):
            signal.signal(signal.SIGHUP, self._handle_signal)

    def _handle_signal(self, sig, frame):
        """Called when one of the signals is received.
        Performs cleanup and exits the program cleanly.
        """
        LOG.info(f"Signal {sig} received. Cleaning up...")
        try:
            self.stop()
        except Exception as e:
            LOG.error(f"Error during cleanup: {e}")
        finally:
            sys.exit(128 + sig)

    def _build_replay_paths(self):
        """Return the deduped, deterministic list of recording paths to pass
        to mitmproxy. Logs each path so failures can be attributed to a
        specific recording in mitmproxy.log."""
        seen = set()
        paths = []
        for playback_file in self.playback_files:
            normalized = os.path.normpath(playback_file.recording_path)
            if normalized in seen:
                LOG.warning(f"Duplicate playback file ignored: {normalized}")
                continue
            if not os.path.exists(normalized):
                LOG.error(
                    f"Playback file is missing on disk and will be skipped: {normalized}"
                )
                continue
            seen.add(normalized)
            paths.append(normalized)

        if not paths:
            raise Exception("No usable playback recordings after dedupe; aborting.")

        for path in paths:
            LOG.info(f"mitmproxy recording: {path}")
        return paths

    def generate_mitmdump_path(self):
        mitmdump_path_tail = ["mitmdump"]
        if (
            self.config["playback_version"] in ("11.0.0", "12.2.1")
            and sys.platform == "darwin"
        ):
            # For MacOS newer versions have a different folder structure.
            # Prepend this new path
            mitmdump_path_tail = [
                "mitmproxy.app",
                "Contents",
                "MacOS",
            ] + mitmdump_path_tail

        # mitmproxy is unpacked here
        self.mitmdump_path_dir = os.path.normpath(
            os.path.join(
                self.mozproxy_dir,
                f"mitmdump-{self.config['playback_version']}",
            )
        )
        self.mitmdump_path = os.path.normpath(
            os.path.join(self.mitmdump_path_dir, *mitmdump_path_tail)
        )

    def download_mitm_bin(self):
        # Download and setup mitm binaries

        manifest = os.path.join(
            here,
            "manifests",
            f"mitmproxy-rel-bin-{self.config['playback_version']}-{{platform}}.manifest",
        )
        transformed_manifest = transform_platform(
            manifest,
            self.config["platform"],
            platform.processor(),
            self.config["playback_version"],
        )

        # generate the mitmdump_path
        self.generate_mitmdump_path()

        # Check if mitmproxy bin exists
        if os.path.exists(self.mitmdump_path):
            LOG.info("mitmproxy binary already exists. Skipping download")
        else:
            # Download and unpack mitmproxy binary
            download_path = self.mitmdump_path_dir
            LOG.info(f"create mitmproxy {self.config['playback_version']} dir")
            if not os.path.exists(download_path):
                os.makedirs(download_path)

            LOG.info("downloading mitmproxy binary")
            tooltool_download(
                transformed_manifest, self.config["run_local"], download_path
            )

    def download_manifest_file(self, manifest_path):
        # Manifest File
        # we use one pageset for all platforms
        LOG.info("downloading mitmproxy pageset")

        tooltool_download(manifest_path, self.config["run_local"], self.mozproxy_dir)

        with open(manifest_path) as manifest_file:
            manifest = json.load(manifest_file)
            for file in manifest:
                zip_path = os.path.join(self.mozproxy_dir, file["filename"])
                LOG.info(f"Adding {zip_path} to recording list")
                self.playback_files.append(RecordingFile(zip_path))

    def download_playback_files(self):
        # Detect type of file from playback_files and download accordingly
        if "playback_files" not in self.config:
            LOG.error(
                "playback_files value was not provided. Proxy service wont' start "
            )
            raise Exception("Please provide a playback_files list.")

        if not isinstance(self.config["playback_files"], list):
            LOG.error("playback_files should be a list")
            raise Exception("playback_files should be a list")

        for playback_file in self.config["playback_files"]:
            if playback_file.startswith("https://") and "mozilla.com" in playback_file:
                # URL provided
                dest = os.path.join(self.mozproxy_dir, os.path.basename(playback_file))
                download_file_from_url(playback_file, self.mozproxy_dir, extract=False)
                # Add Downloaded file to playback_files list
                LOG.info(f"Adding {dest} to recording list")
                self.playback_files.append(RecordingFile(dest))
                continue

            if not os.path.exists(playback_file):
                LOG.error(
                    f"Zip or manifest file path ({playback_file}) does not exist. Please provide a valid path!"
                )
                raise Exception("Zip or manifest file path does not exist")

            if os.path.splitext(playback_file)[1] == ".zip":
                # zip file path provided
                LOG.info(f"Adding {playback_file} to recording list")
                self.playback_files.append(RecordingFile(playback_file))
            elif os.path.splitext(playback_file)[1] == ".manifest":
                # manifest file path provided
                self.download_manifest_file(playback_file)

    def download(self):
        """Download and unpack mitmproxy binary and pageset using tooltool"""
        if not os.path.exists(self.mozproxy_dir):
            os.makedirs(self.mozproxy_dir)

        self.download_mitm_bin()

        if self.record_mode:
            self.recording = RecordingFile(self.config["recording_file"])
        else:
            self.download_playback_files()

    def stop(self):
        LOG.info("Mitmproxy stop!!")
        self.stop_mitmproxy_playback()
        if self.record_mode and self.recording is not None:
            LOG.info("Record mode ON. Generating zip file ")
            self.recording.generate_zip_file()

    def wait(self, timeout=1):
        """Wait until the mitmproxy process has terminated."""
        # We wait using this method to allow Windows to respond to the Ctrl+Break
        # signal so that we can exit cleanly from the command-line driver.
        while True:
            returncode = self.mitmproxy_proc.wait(timeout)
            if returncode is not None:
                return returncode

    def start(self):
        # go ahead and download and setup mitmproxy
        self.download()

        # mitmproxy must be started before setup, so that the CA cert is available
        self.start_mitmproxy(self.mitmdump_path, self.browser_path)

        # In case the setup fails, we want to stop the process before raising.
        try:
            self.setup()
        except Exception:
            try:
                self.stop()
            except Exception:
                LOG.error("MitmProxy failed to STOP.", exc_info=True)
            LOG.error("Setup of MitmProxy failed.", exc_info=True)
            raise

    def start_mitmproxy(self, mitmdump_path, browser_path):
        """Startup mitmproxy and replay the specified flow file"""
        if self.mitmproxy_proc is not None:
            raise Exception("Proxy already started.")
        self.port = get_available_port()

        LOG.info(f"mitmdump path: {mitmdump_path}")
        LOG.info(f"browser path: {browser_path}")

        # mitmproxy needs some DLL's that are a part of Firefox itself, so add to path
        env = os.environ.copy()
        env["PATH"] = os.path.dirname(browser_path) + os.pathsep + env["PATH"]
        command = [mitmdump_path]

        if self.config.get("verbose", False):
            # Generate mitmproxy verbose logs
            command.extend(["-v"])

        # add proxy host and port options
        command.extend([
            "--listen-host",
            self.host,
            "--listen-port",
            str(self.port),
        ])

        # record mode
        if self.record_mode:
            # generate recording script paths
            command.extend([
                "--save-stream-file",
                os.path.normpath(self.recording.recording_path),
                "--set",
                "websocket=false",
            ])
            if "inject_deterministic" in self.config.keys():
                command.extend([
                    "--scripts",
                    os.path.join(mitm_folder, "scripts", "inject-deterministic.py"),
                ])
            self.recording.set_metadata(
                "proxy_version", self.config["playback_version"]
            )
        # playback mode
        elif len(self.playback_files) > 0:
            if (
                self.config.get("test_name") == "nav-bench"
                and self.config["playback_version"] == "12.2.1"
            ):
                # Common dynamic / anti-bot / session params to strip from
                # URL matching during replay. Without this, sites like reddit
                # produce per-session tokens (?solution=, ?token=, ?_=) that
                # change between recording and playback, causing mitmproxy to
                # 404 every page load.
                ignore_params = ",".join([
                    "solution",
                    "token",
                    "jsc_orig_r",
                    "js_challenge",
                    "_",
                    "t",
                    "ts",
                    "timestamp",
                    "cb",
                    "callback",
                    "ref",
                    "ref_",
                    "pd_rd_r",
                    "pd_rd_w",
                    "pd_rd_wg",
                    "pf_rd_p",
                    "pf_rd_r",
                    "qid",
                    "sr",
                    "sprefix",
                    "psc",
                    "dib",
                    "dib_tag",
                    "browsertime_run",
                ])
                replay_paths = self._build_replay_paths()
                command.extend([
                    "--set",
                    "websocket=false",
                    "--set",
                    "connection_strategy=lazy",
                    "--set",
                    "alt_server_replay_nopop=true",
                    "--set",
                    "alt_server_replay_kill_extra=true",
                    "--set",
                    "alt_server_replay_order_reversed=true",
                    "--set",
                    "tls_version_client_min=TLS1_2",
                    "--set",
                    f"server_replay_ignore_params={ignore_params}",
                    # Force script log calls (replay.match/kill/miss) into
                    # the mitmproxy.log file so we can debug iteration-N
                    # hangs. Without this, ctx.log/logger output is
                    # filtered to warnings only.
                    "--set",
                    "termlog_verbosity=info",
                    "--set",
                    f"alt_server_replay={','.join(replay_paths)}",
                    "--scripts",
                    os.path.normpath(
                        os.path.join(mitm_folder, "scripts", "nav-serverplayback.py")
                    ),
                ])
            elif self.config["playback_version"] in ["8.1.1", "11.0.0", "12.2.1"]:
                replay_paths = self._build_replay_paths()
                command.extend([
                    "--set",
                    "websocket=false",
                    "--set",
                    "connection_strategy=lazy",
                    "--set",
                    "alt_server_replay_nopop=true",
                    "--set",
                    "alt_server_replay_kill_extra=true",
                    "--set",
                    "alt_server_replay_order_reversed=true",
                    "--set",
                    "tls_version_client_min=TLS1_2",
                    "--set",
                    "termlog_verbosity=info",
                    "--set",
                    f"alt_server_replay={','.join(replay_paths)}",
                    "--scripts",
                    os.path.normpath(
                        os.path.join(mitm_folder, "scripts", "alt-serverplayback.py")
                    ),
                ])
            elif self.config["playback_version"] in [
                "4.0.4",
                "5.1.1",
                "6.0.2",
            ]:
                command.extend([
                    "--set",
                    "upstream_cert=false",
                    "--set",
                    "upload_dir=" + os.path.normpath(self.upload_dir),
                    "--set",
                    "websocket=false",
                    "--set",
                    "server_replay_files={}".format(
                        ",".join([
                            os.path.normpath(playback_file.recording_path)
                            for playback_file in self.playback_files
                        ])
                    ),
                    "--scripts",
                    os.path.normpath(
                        os.path.join(
                            mitm_folder, "scripts", "alternate-server-replay.py"
                        )
                    ),
                ])
            else:
                raise Exception("Mitmproxy version is unknown!")

        else:
            raise Exception(
                "Mitmproxy can't start playback! Playback settings missing."
            )

        # mitmproxy needs some DLL's that are a part of Firefox itself, so add to path
        env = os.environ.copy()
        if not os.path.dirname(self.browser_path) in env["PATH"]:
            env["PATH"] = os.path.dirname(self.browser_path) + os.pathsep + env["PATH"]

        mitmproxy_log_path = os.path.join(self.upload_dir, "mitmproxy.log")
        LOG.info(f"Starting mitmproxy playback using env path: {env['PATH']}")
        LOG.info(f"Starting mitmproxy playback using command: {' '.join(command)}")
        # Announce the log path so anyone debugging a hang in CI knows
        # where to look. mitmproxy.log captures replay.match/kill/miss
        # lines from the replay script and is uploaded with the rest
        # of the artifacts.
        LOG.info(f"mitmproxy log file: {mitmproxy_log_path}")
        # to turn off mitmproxy log output, use these params for Popen:
        # Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        self.mitmproxy_proc = ProcessHandler(
            command,
            logfile=mitmproxy_log_path,
            env=env,
            storeOutput=False,
        )
        self.mitmproxy_proc.run()

        end_time = time.time() + MITMDUMP_COMMAND_TIMEOUT

        ready = False
        while time.time() < end_time:
            ready = self.check_proxy(host=self.host, port=self.port)
            if ready:
                LOG.info(
                    f"Mitmproxy playback successfully started on {self.host}:{self.port} as pid {self.mitmproxy_proc.pid}"
                )
                return
            time.sleep(0.25)

        # cannot continue as we won't be able to playback the pages
        LOG.error("Aborting: Mitmproxy process did not startup")
        self.stop_mitmproxy_playback()
        sys.exit(1)  # XXX why do we need to do that? a raise is not enough?

    def stop_mitmproxy_playback(self):
        """Stop the mitproxy server playback"""
        if self.mitmproxy_proc is None or self.mitmproxy_proc.poll() is not None:
            return
        LOG.info(
            f"Stopping mitmproxy playback, killing process {self.mitmproxy_proc.pid}"
        )
        # On Windows, mozprocess brutally kills mitmproxy with TerminateJobObject
        # The process has no chance to gracefully shutdown.
        # Here, we send the process a break event to give it a chance to wrapup.
        # See the signal handler in the alternate-server-replay-4.0.4.py script
        if mozinfo.os == "win":
            LOG.info("Sending CTRL_BREAK_EVENT to mitmproxy")
            os.kill(self.mitmproxy_proc.pid, signal.CTRL_BREAK_EVENT)
            time.sleep(2)

        exit_code = self.mitmproxy_proc.kill()
        self.mitmproxy_proc = None

        if exit_code != 0:
            if exit_code is None:
                LOG.error("Failed to kill the mitmproxy playback process")
                return

            if mozinfo.os == "win":
                from mozprocess.winprocess import (  # noqa
                    ERROR_CONTROL_C_EXIT,
                    ERROR_CONTROL_C_EXIT_DECIMAL,
                )

                if exit_code in [ERROR_CONTROL_C_EXIT, ERROR_CONTROL_C_EXIT_DECIMAL]:
                    LOG.info(
                        f"Successfully killed the mitmproxy playback process with exit code {exit_code}"
                    )
                    return
            log_func = LOG.error
            if self.ignore_mitmdump_exit_failure:
                log_func = LOG.info
            log_func(f"Mitmproxy exited with error code {exit_code}")
        else:
            LOG.info("Successfully killed the mitmproxy playback process")

    def check_proxy(self, host, port):
        """Check that mitmproxy process is working by doing a socket call using the proxy settings
        :param host:  Host of the proxy server
        :param port: Port of the proxy server
        :return: True if the proxy service is working
        """
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.connect((host, port))
            s.shutdown(socket.SHUT_RDWR)
            s.close()
            return True
        except OSError:
            return False
