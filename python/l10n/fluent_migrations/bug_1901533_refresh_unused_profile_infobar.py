# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY, REPLACE
from fluent.migrate.helpers import TERM_REFERENCE


def migrate(ctx):
    """Bug 1901533 - Move the Refresh Firefox infobars into the messaging system, part {index}."""

    source = "toolkit/chrome/global/resetProfile.properties"
    target = "browser/browser/newtab/asrouter.ftl"

    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("refresh-unused-profile-infobar-message"),
                value=REPLACE(
                    source,
                    "resetUnusedProfile.message",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("refresh-reinstalled-profile-infobar-message"),
                value=REPLACE(
                    source,
                    "resetUninstalled.message",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("refresh-profile-infobar-button"),
                value=REPLACE(
                    source,
                    "refreshProfile.resetButton.label",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "refreshProfile.resetButton.accesskey"),
                    )
                ],
            ),
        ],
    )
