# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 2048544 - [devtools] Use moz-page-nav in about:debugging, part {index}."""

    path = "devtools/client/aboutdebugging.ftl"
    ctx.add_transforms(
        path,
        path,
        transforms_from(
            """
about-debugging-sidebar-this-firefox2 = {COPY_PATTERN(from_path, "about-debugging-this-firefox-runtime-name")}

about-debugging-sidebar-this-firefox-title =
    .title = {COPY_PATTERN(from_path, "about-debugging-this-firefox-runtime-name")}

about-debugging-sidebar-setup2 = {COPY_PATTERN(from_path, "about-debugging-sidebar-setup.name")}

about-debugging-sidebar-setup-title =
    .title = {COPY_PATTERN(from_path, "about-debugging-sidebar-setup.name")}
""",
            from_path=path,
        ),
    )
