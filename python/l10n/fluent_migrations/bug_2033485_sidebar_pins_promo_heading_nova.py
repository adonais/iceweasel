# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2033485 - Update vertical tabs pin tabs promo, part {index}."""

    path = "browser/browser/sidebar.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
sidebar-pins-promo-text-2 =
    .heading = {COPY_PATTERN(from_path, "sidebar-pins-promo-text")}
""",
            from_path=path,
        ),
    )
