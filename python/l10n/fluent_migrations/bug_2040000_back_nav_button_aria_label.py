# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2040000 - Add Back button to preferences search results header, part {index}."""

    source = "toolkit/toolkit/global/mozPageHeader.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
back-nav-button-title2 =
    .title = {COPY_PATTERN(from_path, "back-nav-button-title.title")}
    .aria-label = {COPY_PATTERN(from_path, "back-nav-button-title.title")}
""",
            from_path=source,
        ),
    )
