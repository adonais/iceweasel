# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate import COPY_PATTERN
from fluent.migrate.transforms import COPY
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1971433 - Convert Certificates section to config-based prefs - part {index}"""

    # part 1, migrate a legacy string
    source = "security/manager/chrome/pippki/pippki.properties"
    target = "browser/browser/preferences/preferences.ftl"
    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("certs-devices-enable-fips"),
                value=COPY(source, "enable_fips"),
            )
        ],
    )

    # part 2, restructure existing strings
    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
certs-description2 =
    .label = {COPY_PATTERN(from_path, "certs-header")}
    .description = {COPY_PATTERN(from_path, "certs-description")}
""",
            from_path=target,
        ),
    )
