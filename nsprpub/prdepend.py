#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

# This script append the release version to prdepend.h, ensuring a rebuild of
# firefox whenever we do an update.

with open("nsprpub/moz.yaml") as fd:
    for line in fd:
        if line.lstrip().startswith("release:"):
            break
    else:
        raise ValueError("Failed to identify release tag in moz.yaml")

with open("nsprpub/config/prdepend.h", "a") as fd:
    fd.write(f"// {line}")
