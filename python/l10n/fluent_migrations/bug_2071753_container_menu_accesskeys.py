# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2071753 - Drop the accesskeys from the container menu items, part {index}."""

    path = "toolkit/toolkit/global/contextual-identity.ftl"

    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
user-context-personal2 =
    .label = {COPY_PATTERN(from_path, "user-context-personal.label")}
user-context-work2 =
    .label = {COPY_PATTERN(from_path, "user-context-work.label")}
user-context-banking2 =
    .label = {COPY_PATTERN(from_path, "user-context-banking.label")}
user-context-shopping2 =
    .label = {COPY_PATTERN(from_path, "user-context-shopping.label")}
user-context-new-tab2 =
    .label = {COPY_PATTERN(from_path, "user-context-new-tab.label")}
user-context-add-container2 =
    .label = {COPY_PATTERN(from_path, "user-context-add-container.label")}
user-context-manage-containers2 =
    .label = {COPY_PATTERN(from_path, "user-context-manage-containers.label")}
user-context-new-tab2-panel-item = {COPY_PATTERN(from_path, "user-context-new-tab-panel-item")}
user-context-add-container2-panel-item = {COPY_PATTERN(from_path, "user-context-add-container-panel-item")}
user-context-manage-containers2-panel-item = {COPY_PATTERN(from_path, "user-context-manage-containers-panel-item")}
""",
            from_path=path,
        ),
    )
