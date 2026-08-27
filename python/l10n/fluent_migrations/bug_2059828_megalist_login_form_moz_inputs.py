# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2059828 - Convert contextual password manager login form fields to moz-input-*, part {index}."""

    about_logins = "browser/browser/aboutLogins.ftl"
    contextual_manager = "browser/browser/contextual-manager.ftl"
    target = contextual_manager

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
contextual-manager-passwords-origin-field =
    .label = {COPY_PATTERN(about_logins, "login-item-origin-label")}
    .placeholder = {COPY_PATTERN(about_logins, "login-item-origin.placeholder")}
contextual-manager-passwords-origin-field-description = {COPY_PATTERN(contextual_manager, "contextual-manager-passwords-origin-tooltip")}
contextual-manager-passwords-username-field =
    .label = {COPY_PATTERN(about_logins, "login-item-username-label")}
contextual-manager-passwords-username-field-description = {COPY_PATTERN(contextual_manager, "contextual-manager-passwords-username-tooltip")}
contextual-manager-passwords-password-field =
    .label = {COPY_PATTERN(about_logins, "login-item-password-label")}
contextual-manager-passwords-password-field-description = {COPY_PATTERN(contextual_manager, "contextual-manager-passwords-password-tooltip-2")}
""",
            about_logins=about_logins,
            contextual_manager=contextual_manager,
        ),
    )
