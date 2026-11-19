# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re

import fluent.syntax.ast as FTL
from fluent.migrate.transforms import LegacySource, Transform, normalize_printf


class STRIP_LEARN_MORE(LegacySource):
    def __call__(self, ctx):
        element = super().__call__(ctx)
        value = re.sub(r"\s*%1\$S", "", normalize_printf(element.value))
        value = re.sub(r" {2,}", " ", value).strip()
        return Transform.pattern_of(FTL.TextElement(value))


def migrate(ctx):
    """Bug 2060834 - Drop "Learn More" from insecure login autocomplete warning, part {index}."""

    source = "toolkit/chrome/passwordmgr/passwordmgr.properties"
    target = "toolkit/toolkit/main-window/autocomplete.ftl"
    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("autocomplete-insecure-login-warning"),
                value=STRIP_LEARN_MORE(source, "insecureFieldWarningDescription2"),
            ),
        ],
    )
