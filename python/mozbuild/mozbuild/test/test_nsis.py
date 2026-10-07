# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import mozunit

from mozbuild.nsis import installer_files


def test_installer_files_without_maintenance_service():
    files = installer_files(maintenance_service=False)
    assert "nsis/maintenanceservice_installer.nsi" not in files


def test_installer_files_with_maintenance_service():
    base = installer_files(maintenance_service=False)
    with_ms = installer_files(maintenance_service=True)
    assert with_ms[: len(base)] == base
    assert with_ms[len(base) :] == ("nsis/maintenanceservice_installer.nsi",)


if __name__ == "__main__":
    mozunit.main()
