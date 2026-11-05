# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2080165 - Migrate safebrowsing.properties to Fluent, part {index}."""

    source = "browser/chrome/browser/safebrowsing/safebrowsing.properties"
    target = "browser/browser/safebrowsing/blockedSite.ftl"
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
safeb-report-false-deceptive-error-title = {COPY(from_path, "errorReportFalseDeceptiveTitle")}
safeb-report-false-deceptive-error-message = {COPY(from_path, "errorReportFalseDeceptiveMessage")}
""",
            from_path=source,
        ),
    )
