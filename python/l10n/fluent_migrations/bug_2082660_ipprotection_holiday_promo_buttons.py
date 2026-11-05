# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2082660 - Migrate IP Protection holiday promo button strings, part {index}."""

    path = "browser/browser/ipProtection.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
ipprotection-holiday-promo-primary-button = {COPY_PATTERN(from_path, "ipprotection-summer-promo-offramp-open-vpn-primary-button")}
ipprotection-holiday-promo-secondary-button = {COPY_PATTERN(from_path, "ipprotection-summer-promo-offramp-dismiss-secondary-button")}
""",
            from_path=path,
        ),
    )
