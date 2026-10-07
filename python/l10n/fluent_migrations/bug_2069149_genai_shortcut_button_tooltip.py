# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2069149 - Build out the selection shortcuts panel to hold multiple actions, part {index}."""

    target = "browser/browser/genai.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
genai-shortcut-button-2 =
    .tooltiptext = {COPY_PATTERN(from_path, "genai-shortcut-button.aria-label")}
    .aria-label = {COPY_PATTERN(from_path, "genai-shortcut-button.aria-label")}
""",
            from_path=target,
        ),
    )
