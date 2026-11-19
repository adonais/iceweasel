# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2070270 - Remove the visible label from the Clocks widget location search, part {index}."""

    path = "browser/browser/newtab/newtab.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
newtab-clock-widget-search-location-input2 =
    .placeholder = {COPY_PATTERN(from_path, "newtab-clock-widget-search-location-input.placeholder")}
    .aria-label = {COPY_PATTERN(from_path, "newtab-clock-widget-search-location-input.aria-label")}
""",
            from_path=path,
        ),
    )
