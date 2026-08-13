# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Superclass to handle profiling in Raptor-Browsertime.
"""

import gzip
import json
import os
import platform
import subprocess
from pathlib import Path

import mozfile
from logger.logger import RaptorLogger

here = os.path.dirname(os.path.realpath(__file__))
LOG = RaptorLogger(component="raptor-profiling")
import tempfile


class RaptorProfiling:
    """
    Superclass for handling profling for Firefox and Chrome applications.
    """

    def __init__(self, upload_dir, raptor_config, test_config):
        self.upload_dir = upload_dir
        self.raptor_config = raptor_config
        self.test_config = test_config
        self.profile = None
        # Create a temporary directory into which the tests can put
        # their profiles. These files will be assembled into one big
        # zip file later on, which is put into the MOZ_UPLOAD_DIR.
        self.temp_profile_dir = tempfile.mkdtemp()

    def _open_profile_file(self, profile_path):
        """Open a profile file given a path and return the contents."""
        if profile_path.endswith(".gz"):
            with gzip.open(profile_path, "r") as profile_file:
                profile = json.load(profile_file)
        else:
            with open(profile_path, encoding="utf-8") as profile_file:
                profile = json.load(profile_file)
        return profile

    def collect_profiles(self):
        """Collect and return all profile files"""

        def __get_test_type():
            """Returns the type of test that was run.

            For benchmark/scenario tests, we return those specific types,
            but for pageloads we return cold or warm depending on the --cold
            flag.
            """
            if self.test_config.get("type", "pageload") not in (
                "benchmark",
                "scenario",
            ):
                return "cold" if self.raptor_config.get("cold", False) else "warm"
            else:
                return self.test_config.get("type", "benchmark")

        res = []
        if self.raptor_config.get("browsertime"):
            topdir = self.raptor_config.get("browsertime_result_dir")

            # Get the browsertime.json file along with the cold/warm splits
            # if they exist from a chimera test
            results = {"main": None, "cold": None, "warm": None}
            profiling_dir = os.path.join(topdir, "profiling")
            result_dir = profiling_dir if self._is_extra_profiler_run else topdir

            if not os.path.isdir(result_dir):
                # Result directory not found. Return early. Caller will decide
                # if this should throw an error or not.
                LOG.info("Could not find the result directory.")
                return []
            for filename in os.listdir(result_dir):
                if filename == "browsertime.json":
                    results["main"] = os.path.join(result_dir, filename)
                elif filename == "cold-browsertime.json":
                    results["cold"] = os.path.join(result_dir, filename)
                elif filename == "warm-browsertime.json":
                    results["warm"] = os.path.join(result_dir, filename)
                if all(results.values()):
                    break

            if not any(results.values()):
                if self._is_extra_profiler_run:
                    LOG.info(
                        "Could not find any browsertime result JSONs in the artifacts "
                        " for the extra profiler run"
                    )
                    return []
                else:
                    raise Exception(
                        "Could not find any browsertime result JSONs in the artifacts"
                    )

            profile_locations = []
            if self.raptor_config.get("chimera", False):
                if results["warm"] is None or results["cold"] is None:
                    if self._is_extra_profiler_run:
                        LOG.info(
                            "The test ran in chimera mode but we found no cold "
                            "and warm browsertime JSONs. Cannot collect profiles. "
                            "Failing silently because this is an extra profiler run."
                        )
                        return []
                    else:
                        raise Exception(
                            "The test ran in chimera mode but we found no cold "
                            "and warm browsertime JSONs. Cannot collect profiles."
                        )
                profile_locations.extend([
                    ("cold", results["cold"]),
                    ("warm", results["warm"]),
                ])
            else:
                # When we don't run in chimera mode, it means that we
                # either ran a benchmark, scenario test or separate
                # warm/cold pageload tests.
                profile_locations.append((
                    __get_test_type(),
                    results["main"],
                ))

            for testtype, results_json in profile_locations:
                with open(results_json, encoding="utf-8") as f:
                    data = json.load(f)
                results_dir = os.path.dirname(results_json)
                for entry in data:
                    try:
                        for rel_profile_path in entry["files"][
                            self.profile_entry_string
                        ]:
                            res.append({
                                "path": os.path.join(results_dir, rel_profile_path),
                                "type": testtype,
                            })
                    except KeyError:
                        if self._is_extra_profiler_run:
                            LOG.info("Failed to find profiles for extra profiler run.")
                        else:
                            LOG.error("Failed to find profiles.")
        else:
            # Raptor-webext stores its profiles in the self.temp_profile_dir
            # directory
            for profile in os.listdir(self.temp_profile_dir):
                res.append({
                    "path": os.path.join(self.temp_profile_dir, profile),
                    "type": __get_test_type(),
                })

        LOG.info(f"Found {len(res)} profiles: {res}")
        return res

    def post_process_profiles(self):
        """Process profiles with profiler-edit and return the processed profile paths."""

        def _edit_profile(
            input_profile=None,
            output_profile=None,
            name=None,
            labels=False,
            compact=False,
            profiler_edit_args=None,
        ):
            if self.raptor_config.get("run_local"):
                toolchain_dir = Path(
                    os.environ.get("MOZBUILD_STATE_PATH", Path.home() / ".mozbuild")
                )
            else:
                toolchain_dir = Path(os.environ.get("MOZ_FETCHES_DIR", ""))

            profiler_edit = toolchain_dir / "profiler-node-tools" / "profiler-edit.js"

            if platform.system() == "Windows":
                node = toolchain_dir / "node" / "node.exe"
            else:
                node = toolchain_dir / "node" / "bin" / "node"

            if not node.is_file():
                raise FileNotFoundError(f"Node executable not found at {node}")

            if not profiler_edit.is_file():
                raise FileNotFoundError(f"profiler-edit not found at {profiler_edit}")

            if input_profile is None:
                input_profile = self.profile

            if input_profile is None:
                raise ValueError("No input profile specified.")

            if output_profile is None:
                raise ValueError("No output profile path specified.")

            input_profile = Path(input_profile)
            output_profile = Path(output_profile)

            if not input_profile.is_file():
                raise FileNotFoundError(f"Input profile not found: {input_profile}")

            profiler_edit_cmd = [
                str(node),
                "--max-old-space-size=8192",  # Avoid node heap limit problems when post-processing
                str(profiler_edit),
                "-i",
                str(input_profile),
                "-o",
                str(output_profile),
            ]

            if profiler_edit_args is None:
                profiler_edit_args = []

            if labels:
                browser_labels_toml = (
                    Path(__file__).resolve().parent / "browser_function_labels.toml"
                )
                profiler_edit_args.extend([
                    "--insert-label-frames",
                    str(browser_labels_toml),
                ])

            if compact:
                profiler_edit_args.append(
                    "--only-keep-threads-with-markers-matching=-async,-sync"
                )
                profiler_edit_args.append("--merge-non-overlapping-threads-by-name")

            if name:
                profiler_edit_args.extend(["--set-name", name])

            profiler_edit_cmd.extend(profiler_edit_args)

            LOG.info(f"Running: {' '.join(profiler_edit_cmd)}")
            result = subprocess.run(
                profiler_edit_cmd,
                check=False,
                capture_output=True,
                text=True,
            )
            for line in result.stdout.splitlines():
                LOG.info(f"profiler-edit stdout: {line}")
            for line in result.stderr.splitlines():
                LOG.info(f"profiler-edit stderr: {line}")
            if result.returncode != 0:
                raise RuntimeError(
                    f"profiler-edit exited with code {result.returncode}"
                )
            if not output_profile.exists():
                raise RuntimeError(
                    f"profiler-edit did not produce a profile at {output_profile}"
                )

        if self.profile.exists():
            cycles = self.test_config.get("browser_cycles", "")
            browser_cycles = f"{cycles}x" if cycles else ""
            test_name = self.test_config.get("name", "test")

            profiles = []

            profile_configs = [
                {
                    "suffix": "compact",
                    "name_suffix": "(with labels, combined main threads)",
                    "labels": True,
                    "compact": True,
                },
                {
                    "suffix": "raw_all_processes",
                    "name_suffix": "(all processes)",
                },
                {
                    "suffix": "all_processes",
                    "name_suffix": "(with labels, all processes)",
                    "labels": True,
                },
            ]

            for config in profile_configs:
                output_profile_path = (
                    self.upload_dir
                    / f"profile_{test_name}_{config['suffix']}.jslb.gz"  # .jslb.gz should be more space-efficient than .json.gz
                )
                _edit_profile(
                    output_profile=output_profile_path,
                    name=f"{test_name.capitalize()} {browser_cycles} {config['name_suffix']}",
                    labels=config.get("labels", False),
                    compact=config.get("compact", False),
                )
                LOG.info(
                    f"Created {output_profile_path.name} ({output_profile_path.stat().st_size} bytes)"
                )
                profiles.append(output_profile_path)

            self.profile.unlink(missing_ok=True)
            self.profile = None

            return profiles

        raise FileNotFoundError(
            f"Profile post-process failed. Unprocessed profile not found: {self.profile}"
        )

    def clean(self):
        """Clean up temp profile directory created during initialization."""
        if self.temp_profile_dir and Path(self.temp_profile_dir).exists():
            mozfile.remove(self.temp_profile_dir)
