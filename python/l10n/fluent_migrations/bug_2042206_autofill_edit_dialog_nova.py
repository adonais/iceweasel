# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2042206 - Add Nova styling for address and payment edit dialogs, part {index}."""

    source = "browser/browser/preferences/formAutofill.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
autofill-card-number-2 =
    .label = { COPY_PATTERN(from_path, "autofill-card-number") }

autofill-card-name-on-card-2 =
    .label = { COPY_PATTERN(from_path, "autofill-card-name-on-card") }

autofill-card-billing-address-2 =
    .label = { COPY_PATTERN(from_path, "autofill-card-billing-address") }
""",
            from_path=source,
        ),
    )
