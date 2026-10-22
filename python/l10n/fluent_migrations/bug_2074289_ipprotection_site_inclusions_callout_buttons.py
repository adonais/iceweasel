# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2074289 - Land strings for inclusions CFRs, part {index}"""

    source = "browser/browser/ipProtection.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
ipprotection-site-inclusions-callout-secondary-button-existing-users = { COPY_PATTERN(from_path, "ipprotection-feature-introduction-button-secondary-not-now") }

ipprotection-site-inclusions-callout-secondary-button-lapsed-users = { COPY_PATTERN(from_path, "ipprotection-location-selection-callout-secondary-button") }
""",
            from_path=source,
        ),
    )
