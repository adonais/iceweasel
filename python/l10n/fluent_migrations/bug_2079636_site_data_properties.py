# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY, REPLACE
from fluent.migrate.helpers import TERM_REFERENCE


def migrate(ctx):
    """Bug 2079636 - Migrate siteData.properties to Fluent, part {index}."""

    source = "browser/chrome/browser/siteData.properties"
    target = "browser/browser/preferences/siteDataSettings.ftl"

    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("site-data-clear-all-prompt-title"),
                value=COPY(source, "clearSiteDataPromptTitle"),
            ),
            FTL.Message(
                id=FTL.Identifier("site-data-clear-all-prompt-text"),
                value=REPLACE(
                    source,
                    "clearSiteDataPromptText",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("site-data-clear-all-prompt-button"),
                value=COPY(source, "clearSiteDataNow"),
            ),
        ],
    )
