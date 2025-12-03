# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1976118 - Replacing default color pickers on Colors Dialog with moz-input-color components, part {index}."""

    source = "browser/browser/preferences/colors.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
colors-text =
    .label = {COPY_PATTERN(from_path, "colors-text-header")}
    .accesskey = {COPY_PATTERN(from_path, "colors-text-header.accesskey")}
colors-text-background =
    .label = {COPY_PATTERN(from_path, "colors-background")}
    .accesskey = {COPY_PATTERN(from_path, "colors-background.accesskey")}
colors-links-unvisited =
    .label = {COPY_PATTERN(from_path, "colors-unvisited-links")}
    .accesskey = {COPY_PATTERN(from_path, "colors-unvisited-links.accesskey")}
colors-links-visited =
    .label = {COPY_PATTERN(from_path, "colors-visited-links")}
    .accesskey = {COPY_PATTERN(from_path, "colors-visited-links.accesskey")}
""",
            from_path=source,
        ),
    )
