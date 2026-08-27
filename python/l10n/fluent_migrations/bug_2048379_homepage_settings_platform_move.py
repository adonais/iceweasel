# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2048379 - Move homepage settings strings from newtab.ftl into preferences.ftl, part {index}."""

    source = "browser/browser/newtab/newtab.ftl"
    target = "browser/browser/preferences/preferences.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
home-homepage-title =
    .label = {COPY_PATTERN(from_path, "home-homepage-title.label")}

home-homepage-new-windows =
    .label = {COPY_PATTERN(from_path, "home-homepage-new-windows.label")}

home-homepage-new-tabs =
    .label = {COPY_PATTERN(from_path, "home-homepage-new-tabs.label")}

home-homepage-custom-homepage-button =
    .label = {COPY_PATTERN(from_path, "home-homepage-custom-homepage-button.label")}

home-custom-homepage-card-header =
    .label = {COPY_PATTERN(from_path, "home-custom-homepage-card-header.label")}

home-custom-homepage-address =
    .placeholder = {COPY_PATTERN(from_path, "home-custom-homepage-address.placeholder")}

home-custom-homepage-address-button =
    .label = {COPY_PATTERN(from_path, "home-custom-homepage-address-button.label")}

home-custom-homepage-no-results =
    .label = {COPY_PATTERN(from_path, "home-custom-homepage-no-results.label")}

home-custom-homepage-delete-address-button =
    .aria-label = {COPY_PATTERN(from_path, "home-custom-homepage-delete-address-button.aria-label")}
    .title = {COPY_PATTERN(from_path, "home-custom-homepage-delete-address-button.title")}

home-custom-homepage-replace-with-prompt =
    .label = {COPY_PATTERN(from_path, "home-custom-homepage-replace-with-prompt.label")}

home-custom-homepage-current-pages-button =
    .label = {COPY_PATTERN(from_path, "home-custom-homepage-current-pages-button.label")}

home-custom-homepage-bookmarks-button =
    .label = {COPY_PATTERN(from_path, "home-custom-homepage-bookmarks-button.label")}

home-prefs-homepage-extension-option =
    .label = {COPY_PATTERN(from_path, "home-prefs-homepage-extension-option.label")}
""",
            from_path=source,
        ),
    )
