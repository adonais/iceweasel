# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Copy a single objdir file to a destination, preserving its mode (e.g. the
# executable bit) and allowing it to be installed under a different name.
# Installs that need either are expressed in moz.build and run as this build
# action, rather than going through the legacy make/nsinstall install path.

import os
import shutil
import sys


def main(argv):
    source, dest = argv
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy(source, dest)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
