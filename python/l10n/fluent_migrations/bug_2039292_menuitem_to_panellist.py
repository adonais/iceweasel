# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from

def migrate(ctx):
    """Bug 2039292 - Move urlbar result menu labels to message values, part {index}."""

    path = "browser/browser/browser.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
urlbar-result-menu-learn-more2 = {COPY_PATTERN(from_path, "urlbar-result-menu-learn-more.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-result-menu-learn-more.accesskey")}
urlbar-result-menu-remove-from-history2 = {COPY_PATTERN(from_path, "urlbar-result-menu-remove-from-history.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-result-menu-remove-from-history.accesskey")}
urlbar-result-menu-tip-get-help2 = {COPY_PATTERN(from_path, "urlbar-result-menu-tip-get-help.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-result-menu-tip-get-help.accesskey")}
urlbar-result-menu-dismiss-suggestion2 = {COPY_PATTERN(from_path, "urlbar-result-menu-dismiss-suggestion.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-result-menu-dismiss-suggestion.accesskey")}
urlbar-result-menu-manage-firefox-suggest2 = {COPY_PATTERN(from_path, "urlbar-result-menu-manage-firefox-suggest.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-result-menu-manage-firefox-suggest.accesskey")}
urlbar-result-menu-report-inaccurate-location2 = {COPY_PATTERN(from_path, "urlbar-result-menu-report-inaccurate-location.label")}
urlbar-result-menu-show-less-frequently2 = {COPY_PATTERN(from_path, "urlbar-result-menu-show-less-frequently.label")}
urlbar-result-menu-dont-show-weather-suggestions2 = {COPY_PATTERN(from_path, "urlbar-result-menu-dont-show-weather-suggestions.label")}
urlbar-result-realtime-opt-in-dismiss-all2 = {COPY_PATTERN(from_path, "urlbar-result-realtime-opt-in-dismiss-all.label")}
urlbar-result-menu-dont-show-market2 = {COPY_PATTERN(from_path, "urlbar-result-menu-dont-show-market.label")}
urlbar-result-menu-trending-dont-show2 = {COPY_PATTERN(from_path, "urlbar-result-menu-trending-dont-show.label")}
    .accesskey = {COPY_PATTERN(from_path, "urlbar-result-menu-trending-dont-show.accesskey")}
""",
            from_path=path,
        ),
    )
