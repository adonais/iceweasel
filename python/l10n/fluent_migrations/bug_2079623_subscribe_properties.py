# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY, REPLACE
from fluent.migrate.helpers import VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 2079623 - Migrate subscribe.properties to Fluent, part {index}."""

    source = "browser/chrome/browser/feeds/subscribe.properties"
    target = "browser/browser/webProtocolHandler.ftl"

    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("protocolhandler-add-handler-message"),
                value=REPLACE(
                    source,
                    "addProtocolHandlerMessage",
                    {
                        "%1$S": VARIABLE_REFERENCE("host"),
                        "%2$S": VARIABLE_REFERENCE("protocol"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("protocolhandler-add-handler-button"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "addProtocolHandlerAddButton"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "addProtocolHandlerAddButtonAccesskey"),
                    ),
                ],
            ),
        ],
    )
