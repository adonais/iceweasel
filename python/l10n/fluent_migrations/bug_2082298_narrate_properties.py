# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.helpers import VARIABLE_REFERENCE
from fluent.migrate.transforms import COPY, REPLACE


def migrate(ctx):
    """Bug 2082298 - Migrate narrate.properties to Fluent, part {index}."""

    source = "toolkit/chrome/global/narrate.properties"
    target = "toolkit/toolkit/global/narrate.ftl"

    def shortcut_title(id, key):
        return FTL.Message(
            id=FTL.Identifier(id),
            attributes=[
                FTL.Attribute(
                    id=FTL.Identifier("title"),
                    value=REPLACE(
                        source,
                        key,
                        {"%1$S": VARIABLE_REFERENCE("shortcut")},
                    ),
                ),
            ],
        )

    def title(id, key):
        return FTL.Message(
            id=FTL.Identifier(id),
            attributes=[
                FTL.Attribute(
                    id=FTL.Identifier("title"),
                    value=COPY(source, key),
                ),
            ],
        )

    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("narrate-toggle-label"),
                value=REPLACE(
                    source,
                    "read-aloud-label",
                    {"%1$S": VARIABLE_REFERENCE("shortcut")},
                ),
            ),
            shortcut_title("narrate-skip-previous", "previous-label"),
            shortcut_title("narrate-start", "start-label"),
            shortcut_title("narrate-stop", "stop-label"),
            shortcut_title("narrate-skip-next", "next-label"),
            FTL.Message(
                id=FTL.Identifier("narrate-header"),
                value=COPY(source, "read-aloud-header"),
            ),
            title("narrate-rate-slow", "slow-speed-label"),
            title("narrate-rate-fast", "fast-speed-label"),
            FTL.Message(
                id=FTL.Identifier("narrate-voice-header"),
                value=COPY(source, "select-voice-header"),
            ),
            FTL.Message(
                id=FTL.Identifier("narrate-voice-default"),
                value=COPY(source, "defaultvoice"),
            ),
            FTL.Message(
                id=FTL.Identifier("narrate-voice-label"),
                value=REPLACE(
                    source,
                    "voiceLabel",
                    {
                        "%1$S": VARIABLE_REFERENCE("name"),
                        "%2$S": VARIABLE_REFERENCE("language"),
                    },
                ),
            ),
        ],
    )
