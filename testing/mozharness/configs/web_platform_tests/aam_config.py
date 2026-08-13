# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os

config = {
    "virtualenv_modules": [
        "PyGObject; sys_platform == 'linux'",
    ],
    "find_links": [
        os.path.abspath(os.environ.get("MOZ_FETCHES_DIR")),
        "https://pypi.pub.build.mozilla.org/pub/",
    ],
}
