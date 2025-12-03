# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1802201 - Make timepicker panel for time inputs accessible, part {index}."""

    source = "toolkit/toolkit/global/datepicker.ftl"
    target = "toolkit/toolkit/global/datetimepicker.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
date-picker-label =
    .aria-label = {COPY_PATTERN(from_path, "date-picker-label.aria-label")}
date-spinner-label =
    .aria-label = {COPY_PATTERN(from_path, "date-spinner-label.aria-label")}
date-picker-clear-button = {COPY_PATTERN(from_path, "date-picker-clear-button")}
date-picker-previous =
    .aria-label = {COPY_PATTERN(from_path, "date-picker-previous.aria-label")}
date-picker-next =
    .aria-label = {COPY_PATTERN(from_path, "date-picker-next.aria-label")}
date-spinner-month =
    .aria-label = {COPY_PATTERN(from_path, "date-spinner-month.aria-label")}
date-spinner-year =
    .aria-label = {COPY_PATTERN(from_path, "date-spinner-year.aria-label")}
date-spinner-month-previous =
    .aria-label = {COPY_PATTERN(from_path, "date-spinner-month-previous.aria-label")}
date-spinner-month-next =
    .aria-label = {COPY_PATTERN(from_path, "date-spinner-month-next.aria-label")}
date-spinner-year-previous =
    .aria-label = {COPY_PATTERN(from_path, "date-spinner-year-previous.aria-label")}
date-spinner-year-next =
    .aria-label = {COPY_PATTERN(from_path, "date-spinner-year-next.aria-label")}
""",
            from_path=source,
        ),
    )
