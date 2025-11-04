# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1858811 - moz-button split button, part {index}."""

    source = "browser/browser/contextual-manager.ftl"
    target = "toolkit/toolkit/global/mozButton.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
moz-button-more-options =
    .title = {COPY_PATTERN(from_path, "contextual-manager-menu-more-options-button.title")}
    .aria-label = {COPY_PATTERN(from_path, "contextual-manager-more-options-popup.aria-label ")}
""",
            from_path=source,
        ),
    )
