# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2055065 - Convert PiP subtitles toggle and font size radios to moz-* components, part {index}."""
    source = "toolkit/toolkit/pictureinpicture/pictureinpicture.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
pictureinpicture-subtitles-toggle =
    .label = {COPY_PATTERN(from_path, "pictureinpicture-subtitles-label")}

pictureinpicture-font-size-group =
    .label = {COPY_PATTERN(from_path, "pictureinpicture-font-size-label")}

pictureinpicture-font-size-small-radio =
    .label = {COPY_PATTERN(from_path, "pictureinpicture-font-size-small")}

pictureinpicture-font-size-medium-radio =
    .label = {COPY_PATTERN(from_path, "pictureinpicture-font-size-medium")}

pictureinpicture-font-size-large-radio =
    .label = {COPY_PATTERN(from_path, "pictureinpicture-font-size-large")}
""",
            from_path=source,
        ),
    )
