# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

config = {
    "default_actions": ["package-source"],
    "env": {
        "HG_SHARE_BASE_DIR": "/builds/hg-shared",
        "TINDERBOX_OUTPUT": "1",
        "LC_ALL": "C",
        "MOZ_OBJDIR": "%(abs_obj_dir)s",
    },
    "upload_env": {
        "UPLOAD_PATH": "/builds/worker/artifacts/",
    },
}
