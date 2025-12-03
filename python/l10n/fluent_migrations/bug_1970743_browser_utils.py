# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from
from fluent.migrate.transforms import COPY


def migrate(ctx):
    """Bug 1970743 - move some download strings to browser-utils.ftl, part {index}."""
    source = "toolkit/toolkit/downloads/downloadUtils.ftl"
    target = "toolkit/toolkit/global/browser-utils.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
browser-utils-file-scheme = {COPY_PATTERN(from_path, "download-utils-done-file-scheme")}

browser-utils-url-scheme = {COPY_PATTERN(from_path, "download-utils-done-scheme")}
""",
            from_path=source,
        ),
    )
