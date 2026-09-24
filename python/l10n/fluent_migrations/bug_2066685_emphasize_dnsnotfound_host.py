# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.transforms import TransformPattern


class EMPHASIZE_HOST(TransformPattern):
    """Wrap the placeable in <strong></strong> and rename it from { $domain } to
    { $hostname }, keeping the rest of each translation, including where in the
    sentence the host sits."""

    def visit_Placeable(self, node):
        if (
            isinstance(node.expression, FTL.VariableReference)
            and node.expression.id.name == "domain"
        ):
            return FTL.Pattern(
                elements=[
                    FTL.TextElement("<strong>"),
                    FTL.Placeable(
                        expression=FTL.VariableReference(id=FTL.Identifier("hostname"))
                    ),
                    FTL.TextElement("</strong>"),
                ]
            )
        return super().visit_Placeable(node)


def migrate(ctx):
    """Bug 2066685 - Emphasize the host in the dnsNotFound search CTA intro, part {index}."""

    path = "toolkit/toolkit/neterror/netError.ftl"
    ctx.add_transforms(
        path,
        path,
        [
            FTL.Message(
                id=FTL.Identifier("neterror-search-cta-intro2"),
                value=EMPHASIZE_HOST(path, "neterror-search-cta-intro"),
            ),
        ],
    )
