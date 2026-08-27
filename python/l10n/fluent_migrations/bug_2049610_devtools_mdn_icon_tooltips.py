# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re

import fluent.syntax.ast as FTL
from fluent.migrate.transforms import TransformPattern


class UNWRAP_LEARN_MORE(TransformPattern):
    """Drop the <span data-l10n-name="link"> wrapper, keeping its inner text."""

    def visit_TextElement(self, node):
        node.value = re.sub(r"</?span[^>]*>", "", node.value)
        return node


class STRIP_LEARN_MORE(TransformPattern):
    """Drop the trailing "{ learn-more }" reference and the whitespace before it."""

    # Strips whitespace at end of string value before { learn-more }
    def visit_TextElement(self, node):
        node.value = node.value.rstrip()
        return node

    # Drops { learn-more } placeable
    def visit_Placeable(self, node):
        if (
            isinstance(node.expression, FTL.MessageReference)
            and node.expression.id.name == "learn-more"
        ):
            return None
        return super().visit_Placeable(node)


def migrate(ctx):
    """Bug 2049610 - [devtools] add mdn icon to links in compat/inactive tooltips, part {index}."""

    path = "devtools/client/tooltips.ftl"
    ctx.add_transforms(
        path,
        path,
        [
            FTL.Message(
                id=FTL.Identifier("devtools-tooltip-learn-more"),
                value=UNWRAP_LEARN_MORE(path, "learn-more"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-or-flex-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-or-flex-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-or-flex-or-block-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-or-flex-or-block-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-or-flex-container-or-multicol-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-or-flex-container-or-multicol-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-multicol-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-multicol-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-column-span-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-column-span-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-or-flex-or-absolutely-positioned-item-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-or-flex-or-absolutely-positioned-item-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-or-absolutely-positioned-item-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-or-absolutely-positioned-item-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-absolutely-positioned-item-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-absolutely-positioned-item-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-no-default-anchor-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-no-default-anchor-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-or-flex-item-fix-4"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-or-flex-item-fix-3"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-item-fix-3"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-item-fix-2"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-grid-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-grid-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-flex-item-fix-3"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-flex-item-fix-2"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-flex-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-flex-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-inline-or-tablecell-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-inline-or-tablecell-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-non-replaced-inline-or-table-row-or-row-group-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-non-replaced-inline-or-table-row-or-row-group-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-non-replaced-inline-or-table-column-or-column-group-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-non-replaced-inline-or-table-column-or-column-group-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-display-block-on-floated-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-display-block-on-floated-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-only-non-grid-or-flex-item-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-only-non-grid-or-flex-item-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-block-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-block-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-block-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-block-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-block-flex-grid-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-block-flex-grid-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-floated-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-floated-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-position-property-on-unpositioned-box-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-position-property-on-unpositioned-box-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-only-replaced-elements-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-only-replaced-elements-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-text-overflow-when-no-overflow-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-text-overflow-when-no-overflow-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-no-size-containment-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-no-size-containment-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-for-internal-table-elements-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-for-internal-table-elements-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-for-internal-table-elements-except-table-cells-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-for-internal-table-elements-except-table-cells-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-table-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-table-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-collapsed-table-borders-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-collapsed-table-borders-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-not-table-cell-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-not-table-cell-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-scroll-padding-when-not-scroll-container-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-scroll-padding-when-not-scroll-container-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-border-image-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-border-image-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-resize-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-resize-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-ruby-element-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-ruby-element-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-text-wrap-balance-lines-exceeded-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-text-wrap-balance-lines-exceeded-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-text-wrap-balance-fragmented-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-text-wrap-balance-fragmented-fix"),
            ),
            FTL.Message(
                id=FTL.Identifier("inactive-css-no-principal-box-fix-1"),
                value=STRIP_LEARN_MORE(path, "inactive-css-no-principal-box-fix"),
            ),
        ],
    )
