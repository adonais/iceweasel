# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.helpers import TERM_REFERENCE, VARIABLE_REFERENCE
from fluent.migrate.transforms import COPY, REPLACE


def migrate(ctx):
    """Bug 1880918 - Migrate WebAuthn strings from browser.properties to webauthnDialog.ftl, part {index}."""

    source = "browser/chrome/browser/browser.properties"
    target = "browser/browser/webauthnDialog.ftl"

    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("webauthn-user-presence-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.userPresencePrompt",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-register-direct-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.registerDirectPrompt3",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-register-direct-prompt-hint"),
                value=REPLACE(
                    source,
                    "webauthn.registerDirectPromptHint",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-select-sign-result-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.selectSignResultPrompt",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-select-device-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.selectDevicePrompt",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-device-blocked-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.deviceBlockedPrompt",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-pin-auth-blocked-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.pinAuthBlockedPrompt",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-pin-not-set-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.pinNotSetPrompt",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-uv-blocked-prompt"),
                value=REPLACE(
                    source,
                    "webauthn.uvBlockedPrompt",
                    {"%1$S": VARIABLE_REFERENCE("hostname")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-already-registered-prompt"),
                value=COPY(
                    source,
                    "webauthn.alreadyRegisteredPrompt",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-cancel"),
                value=COPY(
                    source,
                    "webauthn.cancel",
                ),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "webauthn.cancel.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-allow"),
                value=COPY(
                    source,
                    "webauthn.allow",
                ),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "webauthn.allow.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("webauthn-block"),
                value=COPY(
                    source,
                    "webauthn.block",
                ),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "webauthn.block.accesskey"),
                    ),
                ],
            ),
        ],
    )
