# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2065554 - Implement carousel card type, part {index}."""

    newtab = "browser/browser/newtab/newtab.ftl"
    ctx.add_transforms(
        newtab,
        newtab,
        transforms_from(
            """
newtab-carousel-previous =
    .aria-label = {COPY_PATTERN(from_path, "newtab-sports-widget-pagination-previous.aria-label")}
newtab-carousel-next =
    .aria-label = {COPY_PATTERN(from_path, "newtab-sports-widget-pagination-next.aria-label")}
""",
            from_path=newtab,
        ),
    )
