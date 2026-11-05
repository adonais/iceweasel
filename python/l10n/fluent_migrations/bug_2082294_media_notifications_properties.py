# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY, REPLACE
from fluent.migrate.helpers import TERM_REFERENCE, VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 2082294 - Migrate media notification bar strings from browser.properties to Fluent, part {index}."""

    source = "browser/chrome/browser/browser.properties"
    target = "browser/browser/browser.ftl"

    def message(id, key):
        return FTL.Message(
            id=FTL.Identifier(id),
            value=COPY(source, key),
        )

    def button(id, label_key, accesskey_key):
        return FTL.Message(
            id=FTL.Identifier(id),
            attributes=[
                FTL.Attribute(
                    id=FTL.Identifier("label"),
                    value=COPY(source, label_key),
                ),
                FTL.Attribute(
                    id=FTL.Identifier("accesskey"),
                    value=COPY(source, accesskey_key),
                ),
            ],
        )

    ctx.add_transforms(
        target,
        target,
        [
            message(
                "eme-notifications-drm-content-disabled-message",
                "emeNotifications.drmContentDisabled.message2",
            ),
            button(
                "eme-notifications-drm-content-disabled-button",
                "emeNotifications.drmContentDisabled.button.label",
                "emeNotifications.drmContentDisabled.button.accesskey",
            ),
            FTL.Message(
                id=FTL.Identifier(
                    "eme-notifications-drm-content-cdm-installing-message"
                ),
                value=REPLACE(
                    source,
                    "emeNotifications.drmContentCDMInstalling.message",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            message(
                "decoder-doctor-no-codecs-linux-message",
                "decoder.noCodecsLinux.message",
            ),
            message(
                "decoder-doctor-no-hw-acceleration-message",
                "decoder.noHWAcceleration.message",
            ),
            message(
                "decoder-doctor-no-pulse-audio-message",
                "decoder.noPulseAudio.message",
            ),
            message(
                "decoder-doctor-unsupported-libavcodec-message",
                "decoder.unsupportedLibavcodec.message",
            ),
            message(
                "decoder-doctor-decode-error-message",
                "decoder.decodeError.message",
            ),
            message(
                "decoder-doctor-decode-warning-message",
                "decoder.decodeWarning.message",
            ),
            message(
                "decoder-doctor-learn-how-link",
                "decoder.noCodecs.button",
            ),
            button(
                "decoder-doctor-report-issue-button",
                "decoder.decodeError.button",
                "decoder.decodeError.accesskey",
            ),
            FTL.Message(
                id=FTL.Identifier("plugin-crashed-notification-message"),
                value=REPLACE(
                    source,
                    "crashedpluginsMessage.title",
                    {"%1$S": VARIABLE_REFERENCE("pluginName")},
                ),
            ),
            button(
                "plugin-crashed-notification-reload-button",
                "crashedpluginsMessage.reloadButton.label",
                "crashedpluginsMessage.reloadButton.accesskey",
            ),
            button(
                "plugin-crashed-notification-submit-button",
                "crashedpluginsMessage.submitButton.label",
                "crashedpluginsMessage.submitButton.accesskey",
            ),
        ],
    )
