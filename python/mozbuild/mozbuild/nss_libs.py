# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


def nss_link_dylibs(substs, defines):
    """Return the NSS shared libraries that the megazord and rusttests
    artifacts link against dynamically.

    This is the single source of truth for that list. The mozbuild crate
    reads it through the generated buildconfig in its link_nss function and
    the desktop libsForTests packaging action reads it directly. mozglue is
    included because it belongs to the same set of dynamically linked
    libraries.
    """
    if substs.get("MOZ_FOLD_LIBS"):
        libs = ["nss3"]
    else:
        libs = ["mozsqlite3", "nspr4", "nss3", "nssutil3", "plc4", "plds4", "ssl3"]
    if not defines.get("MOZ_GLUE_IN_PROGRAM"):
        libs.append("mozglue")
    return libs
