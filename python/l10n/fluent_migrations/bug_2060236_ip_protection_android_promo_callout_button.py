# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2060236 - Add VPN for Android promo callout, part {index}."""

    path = "browser/browser/ipProtection.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
ipprotection-android-promo-callout-primary-button = {COPY_PATTERN(from_path, "ipprotection-site-settings-callout-button")}
""",
            from_path=path,
        ),
    )
