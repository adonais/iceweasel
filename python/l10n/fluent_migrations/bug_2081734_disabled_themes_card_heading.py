# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2081734 - Make disabled themes section an accordion-type moz-card, part {index}."""

    source = "toolkit/toolkit/about/aboutAddons.ftl"
    target = "toolkit/toolkit/about/aboutAddons.ftl"
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
theme-disabled-heading3 =
    .heading = {COPY_PATTERN(from_path, "theme-disabled-heading2")}
""",
            from_path=source,
        ),
    )
