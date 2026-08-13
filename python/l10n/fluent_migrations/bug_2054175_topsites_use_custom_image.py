# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re

import fluent.syntax.ast as FTL
from fluent.migrate.transforms import TransformPattern


class STRIP_ELLIPSIS(TransformPattern):
    def visit_TextElement(self, node):
        node.value = re.sub(r"(?:…|\.\.\.)$", "", node.value)
        return node


def migrate(ctx):
    """Bug 2054175 - Remove ellipsis from top sites custom image link, part {index}."""
    source = "browser/browser/newtab/newtab.ftl"
    ctx.add_transforms(
        source,
        source,
        [
            FTL.Message(
                id=FTL.Identifier("newtab-topsites-use-custom-image-link"),
                value=STRIP_ELLIPSIS(source, "newtab-topsites-use-image-link"),
            ),
        ],
    )
