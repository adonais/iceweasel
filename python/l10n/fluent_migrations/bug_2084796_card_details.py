# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2084796 - Update the card details in the credit card doorhanger, part {index}."""

    path = "toolkit/toolkit/formautofill/formAutofill.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
credit-card-doorhanger-card-details-name = {COPY_PATTERN(from_path, "credit-card-doorhanger-details-name")}
credit-card-doorhanger-card-details-expiration = {COPY_PATTERN(from_path, "credit-card-doorhanger-details-expiration")}
""",
            from_path=path,
        ),
    )
