# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re
import fluent.syntax.ast as FTL
from fluent.migrate import COPY_PATTERN
from fluent.migrate.transforms import TransformPattern


def migrate(ctx):
    """Bug 1969949 - Convert startup windows launch on login disabled moz-message-bar conversion, part {index}."""
    path = "browser/browser/preferences/preferences.ftl"
    ctx.add_transforms(
        path,
        path,
        [
            FTL.Message(
                id=FTL.Identifier("startup-windows-launch-on-login-profile-disabled"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("message"),
                        value=COPY_PATTERN(
                            path, "windows-launch-on-login-profile-disabled"
                        ),
                    ),
                ],
            ),
        ],
    )
