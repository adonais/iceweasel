# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2048035 - Reuse existing translations for IP Protection feature introduction title and get-started button, part {index}."""

    source = "browser/browser/ipProtection.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
ipprotection-feature-introduction-title-1 = { COPY_PATTERN(from_path, "unauthenticated-vpn-title") }
ipprotection-feature-introduction-button-get-started = { COPY_PATTERN(from_path, "unauthenticated-get-started") }
""",
            from_path=source,
        ),
    )
