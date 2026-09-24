# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2047987 - Add panel-item label variants for container context menu items, part {index}."""

    path = "toolkit/toolkit/global/contextual-identity.ftl"

    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
user-context-personal-panel-item = {COPY_PATTERN(from_path, "user-context-personal.label")}
    .accesskey = {COPY_PATTERN(from_path, "user-context-personal.accesskey")}
user-context-work-panel-item = {COPY_PATTERN(from_path, "user-context-work.label")}
    .accesskey = {COPY_PATTERN(from_path, "user-context-work.accesskey")}
user-context-banking-panel-item = {COPY_PATTERN(from_path, "user-context-banking.label")}
    .accesskey = {COPY_PATTERN(from_path, "user-context-banking.accesskey")}
user-context-shopping-panel-item = {COPY_PATTERN(from_path, "user-context-shopping.label")}
    .accesskey = {COPY_PATTERN(from_path, "user-context-shopping.accesskey")}
user-context-new-tab-panel-item = {COPY_PATTERN(from_path, "user-context-new-tab.label")}
    .accesskey = {COPY_PATTERN(from_path, "user-context-new-tab.accesskey")}
user-context-add-container-panel-item = {COPY_PATTERN(from_path, "user-context-add-container.label")}
    .accesskey = {COPY_PATTERN(from_path, "user-context-add-container.accesskey")}
user-context-manage-containers-panel-item = {COPY_PATTERN(from_path, "user-context-manage-containers.label")}
    .accesskey = {COPY_PATTERN(from_path, "user-context-manage-containers.accesskey")}
""",
            from_path=path,
        ),
    )

    path = "browser/browser/browser.ftl"

    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
urlbar-view-context-menu-open-in-tab2 = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-tab.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-tab.accesskey")}
urlbar-view-context-menu-open-in-container-tab2 = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-container-tab.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-container-tab.accesskey")}
urlbar-view-context-menu-open-in-window2 = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-window.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-window.accesskey")}
urlbar-view-context-menu-open-in-private-window2 = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-private-window.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-view-context-menu-open-in-private-window.accesskey")}
""",
            from_path=path,
        ),
    )
