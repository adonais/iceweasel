# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Module to handle Gecko profiling.
"""

import json
import os
import zipfile

import mozfile
from logger.logger import RaptorLogger
from mozgeckoprofiler import symbolicate_profile

here = os.path.dirname(os.path.realpath(__file__))
LOG = RaptorLogger(component="raptor-gecko-profile")
from raptor_profiling import RaptorProfiling


class GeckoProfile(RaptorProfiling):
    """
    Handle Gecko profiling.

    This allows us to collect Gecko profiling data and to zip results into one file.
    """

    def __init__(self, upload_dir, raptor_config, test_config):
        super().__init__(upload_dir, raptor_config, test_config)

        # define the key in the results json for gecko profiles
        self.profile_entry_string = "geckoProfiles"

        # Each test INI can specify gecko_profile_interval and entries but they
        # can be overrided by user input.
        gecko_profile_interval = raptor_config.get(
            "gecko_profile_interval", None
        ) or test_config.get("gecko_profile_interval", 1)
        gecko_profile_entries = raptor_config.get(
            "gecko_profile_entries", None
        ) or test_config.get("gecko_profile_entries", 1000000)

        # We need symbols_path; if it wasn't passed in on cmdline, set it
        # to use objdir/dist/crashreporter-symbols if none provided
        if (
            not self.raptor_config["symbols_path"]
            and self.raptor_config["run_local"]
            and "MOZ_DEVELOPER_OBJ_DIR" in os.environ
        ):
            self.raptor_config["symbols_path"] = os.path.join(
                os.environ["MOZ_DEVELOPER_OBJ_DIR"], "dist", "crashreporter-symbols"
            )

        # turn on crash reporter if we have symbols
        os.environ["MOZ_CRASHREPORTER_NO_REPORT"] = "1"
        if self.raptor_config["symbols_path"]:
            os.environ["MOZ_CRASHREPORTER"] = "1"
        else:
            os.environ["MOZ_CRASHREPORTER_DISABLE"] = "1"

        # Make sure no archive already exists in the location where
        # we plan to output our profiler archive
        self.profile_arcname = os.path.join(
            self.upload_dir, "profile_{}.zip".format(self.test_config["name"])
        )
        LOG.info(f"Clearing archive {self.profile_arcname}")
        mozfile.remove(self.profile_arcname)

        LOG.info(
            "Activating gecko profiling, temp profile dir:"
            f" {self.temp_profile_dir}, interval: {gecko_profile_interval}, entries: {gecko_profile_entries}"
        )

    @property
    def _is_extra_profiler_run(self):
        return self.raptor_config.get("extra_profiler_run", False)

    def _symbolicate_profile(self, profile):
        try:
            symbolicate_profile(profile)
            return profile
        except MemoryError:
            LOG.critical(
                "Ran out of memory while trying to symbolicate profile.", exc_info=True
            )
            raise
        except Exception:
            LOG.critical(
                "Encountered an exception during profile symbolication.", exc_info=True
            )
            # Do not raise an exception and return the profile so we won't block
            # the profile capturing pipeline if symbolication fails.
            return profile

    def symbolicate(self):
        """
        Symbolicate Gecko profiling data for one pagecycle.

        """
        profiles = self.collect_profiles()
        if len(profiles) == 0:
            if self._is_extra_profiler_run:
                LOG.info("No profiles collected in the extra profiler run")
            else:
                LOG.error("No profiles collected")
            return

        test_type = self.test_config.get("type", "pageload")

        try:
            mode = zipfile.ZIP_DEFLATED
        except NameError:
            mode = zipfile.ZIP_STORED

        with zipfile.ZipFile(self.profile_arcname, "a", mode) as arc:
            for profile_info in profiles:
                profile_path = profile_info["path"]

                LOG.info(f"Opening profile at {profile_path}")
                try:
                    profile = self._open_profile_file(profile_path)
                except FileNotFoundError:
                    if self._is_extra_profiler_run:
                        LOG.info("Profile not found on extra profiler run.")
                    else:
                        LOG.error("Profile not found.")
                    continue

                LOG.info(f"Symbolicating profile from {profile_path}")
                symbolicated_profile = self._symbolicate_profile(profile)

                try:
                    # Write the profiles into a set of folders formatted as:
                    # <TEST-NAME>-<TEST-RUN-TYPE>.
                    # <TEST-RUN-TYPE> can be pageload-{warm,cold} or {test-type}
                    # only for the tests that are not a pageload test.
                    # For example, "cnn-pageload-warm".
                    # The file names are formatted as <ITERATION-TYPE>-<ITERATION>
                    # to clearly indicate without redundant information.
                    # For example, "browser-cycle-1".
                    test_run_type = (
                        "{}-{}".format(test_type, profile_info["type"])
                        if test_type == "pageload"
                        else test_type
                    )
                    folder_name = f"{self.test_config['name']}-{test_run_type}"
                    iteration = str(os.path.split(profile_path)[-1].split("-")[-1])
                    if test_type == "pageload" and profile_info["type"] == "cold":
                        iteration_type = "browser-cycle"
                    elif profile_info["type"] == "warm":
                        iteration_type = "page-cycle"
                    else:
                        iteration_type = "iteration"
                    profile_name = "-".join([iteration_type, iteration])
                    path_in_zip = os.path.join(folder_name, profile_name)

                    LOG.info(
                        f"Adding profile {profile_path} to archive "
                        f"{self.profile_arcname} as {path_in_zip}"
                    )
                    arc.writestr(
                        path_in_zip,
                        json.dumps(symbolicated_profile, ensure_ascii=False).encode(
                            "utf-8"
                        ),
                    )
                except Exception:
                    LOG.exception(
                        f"Failed to add symbolicated profile {profile_path} to "
                        f"archive {self.profile_arcname}"
                    )
                    raise

        # save the latest gecko profile archive to an env var, so later on
        # it can be viewed automatically via the view-gecko-profile tool
        os.environ["RAPTOR_LATEST_PROFILE"] = self.profile_arcname
