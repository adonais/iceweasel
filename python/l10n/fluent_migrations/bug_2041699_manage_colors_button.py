# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re
import fluent.syntax.ast as FTL
from fluent.migrate.transforms import COPY_PATTERN, TransformPattern


class STRIP_ELLIPSIS(TransformPattern):
    """Strip a trailing ellipsis (U+2026 or '...') from a label."""

    def visit_TextElement(self, node):
        node.value = re.sub(r"\s*(?:…|\.\.\.)\s*$", "", node.value)
        return node


def migrate(ctx):
    """Bug 2041699 - Remove trailing ellipsis from Manage colors button, part {index}."""

    source = "browser/browser/preferences/preferences.ftl"

    ctx.add_transforms(
        source,
        source,
        [
            FTL.Message(
                id=FTL.Identifier("preferences-colors-manage-button2"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=STRIP_ELLIPSIS(
                            source, "preferences-colors-manage-button.label"
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY_PATTERN(
                            source, "preferences-colors-manage-button.accesskey"
                        ),
                    ),
                ],
            ),
        ],
    )
