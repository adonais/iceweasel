# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import os
import pathlib
import shutil

from mozperftest.utils import ON_TRY


def before_runs(env):
    if ON_TRY:
        found = False
        fetches_dir = pathlib.Path(os.environ["MOZ_FETCHES_DIR"])
        for file in fetches_dir.glob("xmlstarlet"):
            os.environ["XMLSTARLET"] = f"{fetches_dir / file}"
            found = True
        if not found and not shutil.which("xmllint"):
            raise Exception(
                "Neither xmlstarlet (in fetches) nor xmllint (on PATH) could be "
                f"found. Files in fetches: {list(fetches_dir.iterdir())}"
            )
    else:
        print(
            "Test is expecting `xmlstarlet` or `xmllint` to be available in the path already"
        )
