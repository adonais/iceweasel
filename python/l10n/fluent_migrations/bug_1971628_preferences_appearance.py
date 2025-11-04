# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re
import fluent.syntax.ast as FTL
from fluent.migrate import COPY_PATTERN
from fluent.migrate.transforms import TransformPattern


class STRIP_LINK(TransformPattern):
    def visit_TextElement(self, node):
        node.value = re.sub(r"</?a\b[^>]*>", "", node.value)
        return node


def migrate(ctx):
    """Bug 1971628 - Migrate web appearance footer text to .label without link, transform and condense theme strings part {index}."""
    path = "browser/browser/preferences/preferences.ftl"
    ctx.add_transforms(
        path,
        path,
        [
            FTL.Message(
                id=FTL.Identifier("preferences-web-appearance-link"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=STRIP_LINK(path, "preferences-web-appearance-footer"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("preferences-web-appearance-choice-auto2"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY_PATTERN(
                            path, "preferences-web-appearance-choice-auto"
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("title"),
                        value=COPY_PATTERN(
                            path, "preferences-web-appearance-choice-tooltip-auto.title"
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("preferences-web-appearance-choice-light2"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY_PATTERN(
                            path, "preferences-web-appearance-choice-light"
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("title"),
                        value=COPY_PATTERN(
                            path,
                            "preferences-web-appearance-choice-tooltip-light.title",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("preferences-web-appearance-choice-dark2"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY_PATTERN(
                            path, "preferences-web-appearance-choice-dark"
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("title"),
                        value=COPY_PATTERN(
                            path, "preferences-web-appearance-choice-tooltip-dark.title"
                        ),
                    ),
                ],
            ),
        ],
    )
