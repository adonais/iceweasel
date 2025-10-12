# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1983284 - Process content title in JS instead of Fluent, part {index}."""

    source = "browser/browser/browser.ftl"
    target = source

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
browser-main-private-window-title = { PLATFORM() ->
      [macos] {COPY_PATTERN(from_path, "browser-main-window-titles-mac.data-title-private")}
     *[other] {COPY_PATTERN(from_path, "browser-main-window-titles.data-title-private")}
  }
""",
            from_path=source,
        ),
    )
