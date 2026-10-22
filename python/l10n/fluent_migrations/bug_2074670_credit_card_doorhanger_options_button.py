# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2074670 - Migrate the form autofill options link to a doorhanger button, part {index}."""

    path = "toolkit/toolkit/formautofill/formAutofill.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
credit-card-doorhanger-options-button =
    .title = {COPY_PATTERN(from_path, "autofill-options-link")}
""",
            from_path=path,
        ),
    )
