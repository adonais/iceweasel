# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2050132 - Replace the segmented buttons in the print dialog with moz-segmented-control, part {index}."""

    source = "toolkit/toolkit/printing/printUI.ftl"
    ctx.add_transforms(
        source,
        source,
        transforms_from(
            """
printui-orientation-control =
    .aria-label = {COPY_PATTERN(from_path, "printui-orientation")}
printui-landscape-2 =
    .label = {COPY_PATTERN(from_path, "printui-landscape")}
    .title = {COPY_PATTERN(from_path, "printui-landscape")}
printui-portrait-2 =
    .label = {COPY_PATTERN(from_path, "printui-portrait")}
    .title = {COPY_PATTERN(from_path, "printui-portrait")}
""",
            from_path=source,
        ),
    )
