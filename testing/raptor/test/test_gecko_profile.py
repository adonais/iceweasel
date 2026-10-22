# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
import sys
import tarfile
import tempfile
import zipfile
from unittest.mock import patch

import mozunit

# need this so raptor imports work both from /raptor and via mach
here = os.path.abspath(os.path.dirname(__file__))

raptor_dir = os.path.join(os.path.dirname(here), "raptor")
sys.path.insert(0, raptor_dir)

from gecko_profile import GeckoProfile


@patch("logger.logger.RaptorLogger.info")
@patch("logger.logger.RaptorLogger.critical")
def test_browsertime_profiling(mock_log_info, mock_log_critical):
    result_dir = tempfile.mkdtemp()
    # untar geckoProfile.tar
    with tarfile.open(os.path.join(here, "geckoProfileTest.tar")) as f:
        f.extractall(path=result_dir)

    # Makes sure we can run the profile process against a browsertime-generated
    # profile (geckoProfile-1.json in this test dir)
    upload_dir = tempfile.mkdtemp()
    symbols_path = tempfile.mkdtemp()
    raptor_config = {
        "symbols_path": symbols_path,
        "browsertime": True,
        "browsertime_result_dir": os.path.join(result_dir, "amazon"),
    }
    test_config = {"name": "tp6"}
    try:
        profile = GeckoProfile(upload_dir, raptor_config, test_config)
        profile.symbolicate()
        profile.clean()
        arcname = os.environ["RAPTOR_LATEST_PROFILE"]
        assert os.stat(arcname).st_size > 1000000, "We got a 1mb+ zip"

        with zipfile.ZipFile(arcname) as arc:
            names = arc.namelist()
            assert len(names) == 1, f"Expected one profile, got {names}"
            name = names[0]
            assert os.path.basename(name).startswith("page-cycle-1."), (
                f"Unexpected profile name {name}"
            )
            # The extension has to state the profile's real compression; samply
            # and profiler.firefox.com go by it and don't sniff the content.
            with arc.open(name) as archived_profile:
                gzipped = archived_profile.read(2) == b"\x1f\x8b"
            assert gzipped == name.endswith(".gz"), (
                f"{name} holds {'gzipped data' if gzipped else 'plain JSON'}"
            )
    finally:
        shutil.rmtree(upload_dir)
        shutil.rmtree(symbols_path)
        shutil.rmtree(result_dir)


if __name__ == "__main__":
    mozunit.main()
