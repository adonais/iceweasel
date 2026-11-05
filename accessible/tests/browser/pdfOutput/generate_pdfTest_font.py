# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Generates pdfTest.ttf, a font for PDF output tests. Using this font means the
tests don't depend on which fonts are installed.

Glyphs which are only reachable via OpenType substitution (e.g. ligatures and
script style alternates) have no cmap entry. The font also contains no glyph
names at all; the names below are only used while building it. Therefore, the
only way a PDF consumer can get the text for these glyphs is via the source
text Gecko provides when drawing.

Every glyph is drawn as a box, since the tests only check the text.

This requires fontTools. To regenerate the font, run:
python3 generate_pdfTest_font.py
"""

import os

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.timeTools import timestampFromString
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Glyphs which are mapped directly from characters, keyed by glyph name.
CHAR_GLYPHS = {"space": 0x20}
CHAR_GLYPHS.update({c: ord(c) for c in "abcdefghijklmnopqrstuvwxyz"})
CHAR_GLYPHS.update({f"digit{d}": ord(str(d)) for d in range(10)})
# SQUARE ROOT, which MathML draws for <msqrt>.
CHAR_GLYPHS["radical"] = 0x221A
# RIGHT PARENTHESIS, which MathML draws for <menclose notation="longdiv">.
CHAR_GLYPHS["rparen"] = 0x29
# MATHEMATICAL ITALIC SMALL X, used by MathML for <mi>x</mi>.
CHAR_GLYPHS["italicX"] = 0x1D465
# MATHEMATICAL BOLD CAPITAL A and B, which are outside the BMP.
CHAR_GLYPHS["boldA"] = 0x1D400
CHAR_GLYPHS["boldB"] = 0x1D401
# BULLET and BLACK CIRCLE, which are used to mask password characters.
CHAR_GLYPHS["bullet"] = 0x2022
CHAR_GLYPHS["blackCircle"] = 0x25CF

# Glyphs which have no cmap entry, so they can only be reached via substitution.
SUBST_GLYPHS = [
    "f_i",
    "f_f_i",
    "boldA_boldB",
    "digit2.ssty1",
    "digit2.ssty2",
    "italicX.ssty1",
    "italicX.ssty2",
    "bullet.alt",
    "blackCircle.alt",
]

# The bottom and top of the square root sign. It is much taller than the other
# glyphs, so that it is tall enough for any content in the tests without being
# stretched. Otherwise, it might be drawn using glyphs from a math font
# installed on the system.
RADICAL_BOUNDS = (-1000, 2000)

# The bottom and top of the longdiv sign, for the same reason as
# RADICAL_BOUNDS.
LONGDIV_BOUNDS = (-1000, 2000)

FEATURES = """
languagesystem DFLT dflt;
feature liga {
  sub f f i by f_f_i;
  sub f i by f_i;
  sub boldA boldB by boldA_boldB;
} liga;
feature ssty {
  sub digit2 from [digit2.ssty1 digit2.ssty2];
  sub italicX from [italicX.ssty1 italicX.ssty2];
} ssty;
# Substitute the password mask characters so that if the source text of a
# password were provided, PDF consumers would see it. ccmp (glyph composition
# and decomposition) is used because shapers always apply it.
feature ccmp {
  sub bullet by bullet.alt;
  sub blackCircle by blackCircle.alt;
} ccmp;
"""

ADVANCE = 600
TIMESTAMP = timestampFromString("Fri Sep 25 00:00:00 2026")


def drawBox(yMin=0, yMax=700):
    pen = TTGlyphPen(None)
    pen.moveTo((50, yMin))
    pen.lineTo((50, yMax))
    pen.lineTo((550, yMax))
    pen.lineTo((550, yMin))
    pen.closePath()
    return pen.glyph()


def drawEmpty():
    return TTGlyphPen(None).glyph()


def drawGlyph(name):
    if name == "space":
        return drawEmpty()
    if name == "radical":
        return drawBox(*RADICAL_BOUNDS)
    if name == "rparen":
        return drawBox(*LONGDIV_BOUNDS)
    return drawBox()


glyphOrder = [".notdef"] + list(CHAR_GLYPHS) + SUBST_GLYPHS
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(glyphOrder)
fb.setupCharacterMap({cp: name for name, cp in CHAR_GLYPHS.items()})
fb.setupGlyf({name: drawGlyph(name) for name in glyphOrder})
fb.setupHorizontalMetrics({name: (ADVANCE, 50) for name in glyphOrder})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({
    "familyName": "PdfTest",
    "styleName": "Regular",
    "fullName": "PdfTest Regular",
    "psName": "PdfTest-Regular",
})
fb.setupOS2(
    sTypoAscender=800,
    sTypoDescender=-200,
    sTypoLineGap=0,
    usWinAscent=800,
    usWinDescent=200,
)
# Don't include glyph names, since PDF consumers might use them to guess the
# text for glyphs.
fb.setupPost(keepGlyphNames=False)
addOpenTypeFeaturesFromString(fb.font, FEATURES)
# Use fixed timestamps so that regenerating the font produces the same file.
fb.updateHead(created=TIMESTAMP, modified=TIMESTAMP)
fb.font.recalcTimestamp = False
fb.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdfTest.ttf"))
