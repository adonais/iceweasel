# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1995577 - Update the settings UI for the new `browser.urlbar.suggest.quicksuggest.all` pref, part {index}."""
    source = "browser/browser/preferences/preferences.ftl"
    target = source

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
addressbar-locbar-suggest-all-option =
    .label = {COPY_PATTERN(from_path, "addressbar-locbar-suggest-nonsponsored-option.label")}
addressbar-locbar-suggest-all-option-desc = {COPY_PATTERN(from_path, "addressbar-locbar-suggest-nonsponsored-desc")}
""",
            from_path=source,
        ),
    )
