# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.transforms import TransformPattern
import fluent.syntax.ast as FTL


class FIXUP_REFERENCE(TransformPattern):
    def visit_MessageReference(self, node):
        if node.id.name == "unified-extensions-item-message-manage":
            node.id.name = "unified-extensions-manage-extensions.label"
        return node


def migrate(ctx):
    """Bug 1994180 - Change unified-extensions-item-message-manage reference to unified-extensions-manage-extensions.label, part {index}"""
    path = "browser/browser/unifiedExtensions.ftl"
    ctx.add_transforms(
        path,
        path,
        [
            FTL.Message(
                id=FTL.Identifier("unified-extensions-empty-content-explain-enable2"),
                value=FIXUP_REFERENCE(
                    path, "unified-extensions-empty-content-explain-enable"
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("unified-extensions-empty-content-explain-manage2"),
                value=FIXUP_REFERENCE(
                    path, "unified-extensions-empty-content-explain-manage"
                ),
            ),
        ],
    )
