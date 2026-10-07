# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the repackage task into an actual task description.
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.copy import deepcopy
from taskgraph.util.dependencies import get_primary_dependency

transforms = TransformSequence()


@transforms.add
def split_locales(config, jobs):
    for job in jobs:
        dep_job = get_primary_dependency(config, job)
        assert dep_job

        # The shippable `l10n` kind is chunked and carries `chunk_locales`; the
        # non-shippable `l10n` kind is unchunked, so fall back to `all_locales`.
        locales = dep_job.attributes.get("chunk_locales") or dep_job.attributes.get(
            "all_locales", []
        )
        for locale in locales:
            locale_job = deepcopy(job)  # don't overwrite dict values here
            treeherder = locale_job.setdefault("treeherder", {})
            treeherder_group = locale_job.pop("treeherder-group")
            treeherder["symbol"] = f"{treeherder_group}({locale})"
            locale_job["locale"] = locale
            yield locale_job
