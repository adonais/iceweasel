# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from mozboot.base import BaseBootstrapper
from mozboot.linux_common import LinuxBootstrapper


class OpenSUSEBootstrapper(LinuxBootstrapper, BaseBootstrapper):
    """openSUSE experimental bootstrapper."""

    def __init__(self, version, dist_id, **kwargs):
        print("Using an experimental bootstrapper for openSUSE.")
        BaseBootstrapper.__init__(self, **kwargs)

    def install_packages(self, packages):
        # watchman is not available
        packages = [p for p in packages if p != "watchman"]
        self.zypper_install(*packages)

    def _update_package_manager(self):
        self.zypper_update()

    def zypper(self, *args):
        if self.no_interactive:
            command = ["zypper", "-n", *args]
        else:
            command = ["zypper", *args]

        self.run_as_root(command)

    def zypper_install(self, *packages):
        self.zypper("install", *packages)

    def zypper_update(self, *packages):
        self.zypper("update", *packages)
