# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1982273 - Replace default task names with localized strings, part {index}"""

    source = "browser/browser/newtab/newtab.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
newtab-widget-lists-name-label-default =
    .label = { COPY_PATTERN(from_path, "newtab-widget-lists-default-list-title") }

newtab-widget-lists-name-placeholder-default =
    .placeholder = { COPY_PATTERN(from_path, "newtab-widget-lists-default-list-title") }

newtab-widget-lists-name-placeholder-new =
    .placeholder = { COPY_PATTERN(from_path, "newtab-widget-lists-default-list-new") }
""",
            from_path=source,
        ),
    )
