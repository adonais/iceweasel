# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.helpers import VARIABLE_REFERENCE
from fluent.migrate.transforms import COPY, REPLACE


def migrate(ctx):
    """Bug 1978294 - Convert inspector.properties to Fluent, part {index}."""

    source = "devtools/client/inspector.properties"
    target = "devtools/client/inspector.ftl"
    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier("colorpicker-tooltip-spectrum-dragger-title"),
                value=COPY(source, "colorPickerTooltip.spectrumDraggerTitle"),
            ),
            FTL.Message(
                id=FTL.Identifier("colorpicker-tooltip-eyedropper-title"),
                value=COPY(source, "colorPickerTooltip.eyedropperTitle"),
            ),
            FTL.Message(
                id=FTL.Identifier("colorpicker-tooltip-color-name-title"),
                value=REPLACE(
                    source,
                    "colorPickerTooltip.colorNameTitle",
                    {"%1$S": VARIABLE_REFERENCE("colorName")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("colorpicker-tooltip-hue-slider-title"),
                value=COPY(source, "colorPickerTooltip.hueSliderTitle"),
            ),
            FTL.Message(
                id=FTL.Identifier("colorpicker-tooltip-alpha-slider-title"),
                value=COPY(source, "colorPickerTooltip.alphaSliderTitle"),
            ),
        ],
    )
