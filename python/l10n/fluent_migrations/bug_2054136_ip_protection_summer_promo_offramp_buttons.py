# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2054136 - Reuse existing translations for IP Protection summer promo offramp callout buttons, part {index}."""

    source = "browser/browser/ipProtection.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
ipprotection-summer-promo-offramp-open-vpn-primary-button = { COPY_PATTERN(from_path, "ipprotection-feature-introduction-button-open-vpn") }
ipprotection-summer-promo-offramp-get-subscription-button = { COPY_PATTERN(from_path, "ipprotection-locations-subview-promo-button") }
ipprotection-summer-promo-offramp-dismiss-secondary-button = { COPY_PATTERN(from_path, "ipprotection-location-selection-callout-secondary-button") }
""",
            from_path=source,
        ),
    )
