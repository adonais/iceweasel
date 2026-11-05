# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import glob
import os
import sys

modules = []
if sys.platform == "linux":
    # Install the fetched dependency before PyGObject can resolve a newer version.
    for package in ("pycairo", "pygobject"):
        wheels = glob.glob(
            os.path.join(os.environ["MOZ_FETCHES_DIR"], f"{package}-*.whl")
        )
        if len(wheels) != 1:
            raise RuntimeError(f"Expected one fetched {package} wheel, found {wheels}")
        modules.append(wheels[0])

config = {
    "virtualenv_modules": modules,
    "find_links": [
        os.path.abspath(os.environ.get("MOZ_FETCHES_DIR")),
    ],
}
