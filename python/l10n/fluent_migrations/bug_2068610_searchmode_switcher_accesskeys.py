# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2068610 - Drop the search mode switcher items' accesskeys, part {index}."""

    source = "browser/browser/browser.ftl"
    ctx.add_transforms(
        source,
        source,
        transforms_from(
            """
urlbar-searchmode-bookmarks4 = {COPY_PATTERN(from_path, "urlbar-searchmode-bookmarks3")}
urlbar-searchmode-tabs4 = {COPY_PATTERN(from_path, "urlbar-searchmode-tabs3")}
urlbar-searchmode-history4 = {COPY_PATTERN(from_path, "urlbar-searchmode-history3")}
urlbar-searchmode-actions4 = {COPY_PATTERN(from_path, "urlbar-searchmode-actions3")}
urlbar-searchmode-popup-search-settings2 = {COPY_PATTERN(from_path, "urlbar-searchmode-popup-search-settings")}
urlbar-searchmode-popup-settings2 = {COPY_PATTERN(from_path, "urlbar-searchmode-popup-settings")}
""",
            from_path=source,
        ),
    )
