# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2069512 - Stocks widget search entry point strings, part {index}."""

    source = "browser/browser/newtab/newtab.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
newtab-stocks-search-button =
    .label = {COPY_PATTERN(from_path, "newtab-search-box-search-button.title")}
    .title = {COPY_PATTERN(from_path, "newtab-stocks-search-input.aria-label")}
    .aria-label = {COPY_PATTERN(from_path, "newtab-stocks-search-input.aria-label")}

newtab-stocks-watchlist-empty-search =
    .label = {COPY_PATTERN(from_path, "newtab-search-box-search-button.title")}
    .title = {COPY_PATTERN(from_path, "newtab-stocks-search-input.aria-label")}
    .aria-label = {COPY_PATTERN(from_path, "newtab-stocks-search-input.aria-label")}
""",
            from_path=source,
        ),
    )
