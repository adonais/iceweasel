# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY, REPLACE
from fluent.migrate.helpers import TERM_REFERENCE, VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 2086504 - Migrate process hang and unsigned add-ons notification strings to Fluent, part {index}."""

    source = "browser/chrome/browser/browser.properties"
    target = "browser/browser/browser.ftl"

    def attr(name, key):
        return FTL.Attribute(id=FTL.Identifier(name), value=COPY(source, key))

    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("unsigned-addons-disabled-message"),
                value=COPY(source, "unsignedAddonsDisabled.message"),
            ),
            FTL.Message(
                id=FTL.Identifier("unsigned-addons-disabled-learn-more"),
                attributes=[
                    attr("label", "unsignedAddonsDisabled.learnMore.label"),
                    attr("accesskey", "unsignedAddonsDisabled.learnMore.accesskey"),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("process-hang-selected-tab-message"),
                value=REPLACE(
                    source,
                    "processHang.selected_tab.label",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("process-hang-nonspecific-tab-message"),
                value=REPLACE(
                    source,
                    "processHang.nonspecific_tab.label",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("process-hang-specific-tab-message"),
                value=REPLACE(
                    source,
                    "processHang.specific_tab.label",
                    {
                        "%1$S": VARIABLE_REFERENCE("title"),
                        "%2$S": TERM_REFERENCE("brand-short-name"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("process-hang-addon-message"),
                value=REPLACE(
                    source,
                    "processHang.add-on.label2",
                    {
                        "%1$S": VARIABLE_REFERENCE("addonName"),
                        "%2$S": TERM_REFERENCE("brand-short-name"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("process-hang-addon-learn-more"),
                attributes=[attr("value", "processHang.add-on.learn-more.text")],
            ),
            FTL.Message(
                id=FTL.Identifier("process-hang-stop-button"),
                attributes=[
                    attr("label", "processHang.button_stop2.label"),
                    attr("accesskey", "processHang.button_stop2.accessKey"),
                ],
            ),
        ],
    )
