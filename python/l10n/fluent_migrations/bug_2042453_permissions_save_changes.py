# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2042453 - Add Nova styling for password exceptions, part {index}."""

    path = "browser/browser/preferences/permissions.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
permissions-save-changes-2 =
    .buttonlabelaccept = { COPY_PATTERN(from_path, "permission-dialog.buttonlabelaccept") }
    .buttonaccesskeyaccept = { COPY_PATTERN(from_path, "permission-dialog.buttonaccesskeyaccept") }
""",
            from_path=path,
        ),
    )
