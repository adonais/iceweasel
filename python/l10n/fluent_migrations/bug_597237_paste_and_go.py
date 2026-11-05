# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 597237 - Migrate the paste and go context menu item to Fluent, part {index}."""

    source = "browser/chrome/browser/browser.properties"
    target = "browser/browser/browser.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
urlbar-menuitem-paste-and-go =
    .label = { COPY(from_path, "pasteAndGo.label") }
""",
            from_path=source,
        ),
    )
