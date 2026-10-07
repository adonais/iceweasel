# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Derive a dark colour scheme for sphinx-rtd-theme.

sphinx-rtd-theme has no dark mode and no CSS custom properties to re-point: its
stylesheet carries a couple of hundred colour literals. This reads the
stylesheets the build has already written, maps every colour through OKLCh, and
emits the result as a ``prefers-color-scheme: dark`` override, which keeps it in
step with a theme bump.
"""

import colorsys
import math
import re
from pathlib import Path

# Stylesheets to derive the override from, relative to the output _static
# directory. sphinx-design defines its palette as --sd-color-*
# custom properties on :root, so flipping those carries every component.
SOURCES = (
    "css/theme.css",
    "basic.css",
    "copybutton.css",
    "sphinx-design.min.css",
    "custom_theme.css",
)

PYGMENTS_DARK_STYLE = "github-dark"

# Lightness the extremes land on: white becomes BG_L, black becomes FG_L.
BG_L = 0.22
FG_L = 0.93
# Below this chroma a colour counts as a neutral and simply flips.
NEUTRAL_C = 0.035
# A chromatic colour lighter than this is a tint (an admonition body) and flips
# with the neutrals; a darker one is an accent painted as a surface under light
# text, and keeps its lightness so that text still reads once it has flipped.
# The theme's two groups are far apart: accents run to L 0.836 and the tints
# start at L 0.952, so the threshold sits in the gap.
TINT_L = 0.90
ACCENT_MIN_L = 0.72
ACCENT_C = 0.82

# The sidebar, the mobile header and the version flyout are already dark in the
# light theme. Flipping them would turn them light.
DARK_CHROME = (
    ".wy-nav-side",
    ".wy-side-nav-search",
    ".wy-side-scroll",
    ".wy-menu-vertical",
    ".wy-nav-top",
    ".rst-versions",
)

COLOR_PROPS = re.compile(
    r"^(color|background|background-color|background-image|fill|stroke"
    r"|box-shadow|text-shadow"
    r"|caret-color|outline|outline-color|text-decoration-color"
    r"|column-rule|column-rule-color"
    r"|border(-(top|right|bottom|left))?(-color)?"
    r"|--sd-color-[a-z-]+)$"
)

# The CSS named colours the source stylesheets actually use.
NAMED = {
    "white": (1.0, 1.0, 1.0),
    "black": (0.0, 0.0, 0.0),
    "red": (1.0, 0.0, 0.0),
    "green": (0.0, 0.502, 0.0),
    "blue": (0.0, 0.0, 1.0),
    "grey": (0.502, 0.502, 0.502),
    "gray": (0.502, 0.502, 0.502),
    "silver": (0.753, 0.753, 0.753),
}

# A url() is matched whole so that a colour-shaped substring inside one -- an
# SVG fragment reference, a data: payload -- is left alone.
COLOR_RE = re.compile(
    r"url\([^)]*\)"
    r"|#[0-9a-fA-F]{3,8}\b"
    r"|(?:rgb|hsl)a?\((?:[^()]|\([^()]*\))*\)"
    r"|(?<![\w-])(?:" + "|".join(NAMED) + r")(?![\w-])"
)

# A single numeric token: a CSS <number>, <percentage> or <angle>.
NUMBER_RE = re.compile(r"([+-]?(?:\d+\.?\d*|\.\d+))(%|deg|grad|rad|turn)?$")

DEGREES = {None: 1.0, "deg": 1.0, "grad": 0.9, "rad": 180 / math.pi, "turn": 360.0}

EPSILON = 1e-9

# At-rules whose descendants carry no page colours worth flipping.
SKIP_AT = re.compile(r"@(-[a-z]+-)?(keyframes|font-face)\b")


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def _to_oklch(r, g, b):
    r, g, b = (_srgb_to_linear(c) for c in (r, g, b))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (max(c, 0) ** (1 / 3) for c in (l, m, s))
    lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return lightness, math.hypot(a, b), math.atan2(b, a)


def _to_linear_rgb(lightness, chroma, hue):
    a, b = chroma * math.cos(hue), chroma * math.sin(hue)
    l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def _from_oklch(lightness, chroma, hue):
    rgb = _to_linear_rgb(lightness, chroma, hue)
    if not all(-EPSILON <= c <= 1 + EPSILON for c in rgb):
        # Clipping each channel on its own would shift the hue, so bisect the
        # chroma down instead. Chroma zero is always in gamut here because the
        # lightness is one the flip produced.
        low, high = 0.0, chroma
        for _ in range(20):
            mid = (low + high) / 2
            if all(
                -EPSILON <= c <= 1 + EPSILON
                for c in _to_linear_rgb(lightness, mid, hue)
            ):
                low = mid
            else:
                high = mid
        rgb = _to_linear_rgb(lightness, low, hue)
    return tuple(min(1, max(0, _linear_to_srgb(min(1, max(0, c))))) for c in rgb)


def _number(token):
    """Split a numeric token into its value and its unit, or (None, None)."""
    match = NUMBER_RE.fullmatch(token.strip())
    return (float(match.group(1)), match.group(2)) if match else (None, None)


def _fraction(token, percent_only=True):
    """Read a 0..1 fraction. A bare number is a percentage unless it is alpha."""
    value, unit = _number(token)
    if value is None or unit not in (None, "%"):
        return None
    return value / 100 if unit == "%" or percent_only else value


def _channel(token):
    """Read an rgb() channel as a 0..1 fraction."""
    value, unit = _number(token)
    if value is None or unit not in (None, "%"):
        return None
    return value / 100 if unit == "%" else value / 255


def _parse(token):
    token = token.strip().lower()
    if token in NAMED:
        return NAMED[token], 1.0
    if token.startswith("#"):
        digits = token[1:]
        if len(digits) in (3, 4):
            digits = "".join(c * 2 for c in digits)
        if len(digits) not in (6, 8):
            return None, None
        try:
            rgb = tuple(int(digits[i : i + 2], 16) / 255 for i in (0, 2, 4))
            alpha = int(digits[6:8], 16) / 255 if len(digits) == 8 else 1.0
        except ValueError:
            return None, None
        return rgb, alpha
    match = re.fullmatch(r"(rgb|hsl)a?\((.*)\)", token, re.S)
    if not match:
        return None, None
    body, _, alpha_token = match.group(2).partition("/")
    parts = [p for p in re.split(r"[,\s]+", body.strip()) if p]
    if len(parts) == 4 and not alpha_token:
        parts, alpha_token = parts[:3], parts[3]
    if len(parts) != 3:
        return None, None
    alpha = 1.0
    if alpha_token.strip():
        alpha = _fraction(alpha_token, percent_only=False)
        if alpha is None:
            return None, None
    if match.group(1) == "hsl":
        value, unit = _number(parts[0])
        if value is None or unit == "%":
            return None, None
        channels = [_fraction(p) for p in parts[1:]]
        if None in channels:
            return None, None
        rgb = colorsys.hls_to_rgb(value * DEGREES[unit] / 360, channels[1], channels[0])
    else:
        rgb = tuple(_channel(p) for p in parts)
        if None in rgb:
            return None, None
    return tuple(min(1.0, max(0.0, c)) for c in rgb), min(1.0, max(0.0, alpha))


def _flip(r, g, b):
    lightness, chroma, hue = _to_oklch(r, g, b)
    flipped = BG_L + (FG_L - BG_L) * (1 - lightness)
    if chroma >= NEUTRAL_C:
        chroma *= ACCENT_C
        if lightness <= TINT_L:
            flipped = max(lightness, ACCENT_MIN_L)
    return _from_oklch(flipped, chroma, hue)


def _convert_value(value, prop):
    changed = False
    # A translucent black scrim reads the same over a dark surface, but a
    # translucent black border drawn on one is invisible.
    keep_scrim = "border" not in prop

    def replace(match):
        nonlocal changed
        rgb, alpha = _parse(match.group(0))
        if rgb is None:
            return match.group(0)
        if keep_scrim and alpha < 1 and max(rgb) < 0.1:
            return match.group(0)
        changed = True
        r, g, b = (round(c * 255) for c in _flip(*rgb))
        if alpha < 1:
            return f"rgba({r},{g},{b},{alpha:g})"
        return f"#{r:02x}{g:02x}{b:02x}"

    converted = COLOR_RE.sub(replace, value)
    return converted if changed else None


def _skip_string(css, i):
    """Return the index just past the string literal starting at ``css[i]``."""
    quote, j, n = css[i], i + 1, len(css)
    while j < n and css[j] != quote:
        j += 2 if css[j] == "\\" else 1
    return min(j + 1, n)


def _rules(css):
    """Yield (at-rule stack, selector, declaration block) for every style rule."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out, stack, buf, i, n = [], [], "", 0, len(css)
    while i < n:
        char = css[i]
        if char in "\"'":
            j = _skip_string(css, i)
            buf += css[i:j]
            i = j
            continue
        if char == ";":
            # A statement at-rule such as @charset or @import.
            buf = ""
            i += 1
            continue
        if char == "{":
            head, buf = buf.strip(), ""
            if head.startswith("@"):
                stack.append(head)
                i += 1
                continue
            depth, j = 1, i + 1
            while j < n and depth:
                if css[j] in "\"'":
                    j = _skip_string(css, j)
                    continue
                depth += (css[j] == "{") - (css[j] == "}")
                j += 1
            out.append((tuple(stack), head, css[i + 1 : j - 1]))
            i = j
            continue
        if char == "}":
            if stack:
                stack.pop()
            buf = ""
            i += 1
            continue
        buf += char
        i += 1
    return out


def _split(text, separator):
    """Split on ``separator`` outside of strings and parentheses."""
    out, depth, start, i, n = [], 0, 0, 0, len(text)
    while i < n:
        char = text[i]
        if char in "\"'":
            i = _skip_string(text, i)
            continue
        depth += (char == "(") - (char == ")")
        if char == separator and not depth:
            out.append(text[start:i])
            start = i + 1
        i += 1
    out.append(text[start:])
    return out


def _override(css):
    # Consecutive runs sharing an at-rule context are grouped, which keeps
    # every rule in source order so that the cascade still resolves the same
    # way it does in the source stylesheet.
    groups = []
    for context, selector, block in _rules(css):
        if any(SKIP_AT.match(c) for c in context):
            continue
        kept_selector = ",".join(
            s for s in _split(selector, ",") if not any(p in s for p in DARK_CHROME)
        )
        if not kept_selector.strip():
            continue
        kept = []
        for declaration in _split(block, ";"):
            prop, _, value = declaration.partition(":")
            prop = prop.strip().lower()
            if not COLOR_PROPS.match(prop):
                continue
            important = "!important" in value
            converted = _convert_value(value.replace("!important", "").strip(), prop)
            if converted is None:
                continue
            kept.append(f"{prop}:{converted}{' !important' if important else ''}")
        if kept:
            if not groups or groups[-1][0] != context:
                groups.append((context, []))
            groups[-1][1].append((kept_selector, kept))

    lines = []
    for context, rules in groups:
        indent = "  "
        for at_rule in context:
            lines.append(f"{indent}{at_rule} {{")
            indent += "  "
        for selector, declarations in rules:
            lines.append(f"{indent}{selector} {{ {'; '.join(declarations)} }}")
        for _ in context:
            indent = indent[:-2]
            lines.append(f"{indent}}}")
    return lines


def _write_stylesheets(app, exception):
    if exception or app.builder.name not in ("html", "dirhtml", "singlehtml"):
        return

    from sphinx.util import logging

    logger = logging.getLogger(__name__)
    static = Path(app.outdir) / "_static"
    lines = [
        ":root { color-scheme: light dark; }",
        "",
        "@media (prefers-color-scheme: dark) {",
    ]
    for name in SOURCES:
        source = static / name
        if not source.exists():
            logger.warning("dark_mode: %s is missing, its colours stay light", name)
            continue
        lines.append(f"  /* {name} */")
        lines += _override(source.read_text(encoding="utf-8"))
    lines.append("}")
    (static / "dark_mode.css").write_text("\n".join(lines) + "\n", encoding="utf-8")

    from pygments.formatters import HtmlFormatter

    (static / "pygments_dark.css").write_text(
        HtmlFormatter(style=PYGMENTS_DARK_STYLE).get_style_defs(".highlight"),
        encoding="utf-8",
    )


def setup(app):
    app.add_css_file("pygments_dark.css", media="(prefers-color-scheme: dark)")
    app.add_css_file("dark_mode.css", priority=900)
    app.connect("build-finished", _write_stylesheets)
    return {"parallel_read_safe": True, "parallel_write_safe": True}
