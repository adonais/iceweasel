# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import subprocess

from mozperftest.utils import install_package

"""
Hooks for the startup tests that run android_startup_videoapplink.py, which
needs cv2.
"""

INTERNAL_PYPI = "https://pypi.pub.build.mozilla.org/pub/"
NUMPY_DEPENDENCY = "numpy<2"
OPENCV_DEPENDENCY = "opencv-python==4.10.0.84"
PIP_TIMEOUT = 120


def before_iterations(args):
    virtualenv_manager = args["virtualenv"]
    # Install numpy first so opencv-python's numpy>=1.17.0 dep is already
    # satisfied, then install opencv-python, see similar fix in (bug 2033807)
    install_package(virtualenv_manager, NUMPY_DEPENDENCY)
    subprocess.check_call([
        virtualenv_manager.python_path,
        "-m",
        "pip",
        "install",
        OPENCV_DEPENDENCY,
        "--no-deps",
        "--no-index",
        "--find-links",
        INTERNAL_PYPI,
        "--timeout",
        str(PIP_TIMEOUT),
    ])
