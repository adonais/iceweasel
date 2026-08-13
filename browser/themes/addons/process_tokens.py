# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re

from mozfile import json


def lookup_token(tokens, value):
    keys = value.split(".")
    key = keys[-1]
    for subkey in keys[:-1]:
        tokens = tokens[subkey]
        if not tokens:
            break
    if not tokens or key not in tokens:
        raise ValueError(f"Token not found: {value}")
    return tokens[key]


def _pick_variant(resolved, variant):
    if isinstance(resolved, dict):
        if variant in resolved:
            return resolved[variant]
        if "default" in resolved:
            return resolved["default"]
    return resolved


# Resolve a single reference.
def resolve_ref(path, tokens, variant):
    resolved = lookup_token(tokens, path.replace("/", "."))
    if isinstance(resolved, dict) and "value" in resolved:
        resolved = resolved["value"]
    resolved = _pick_variant(resolved, variant)
    if isinstance(resolved, str):
        return resolve_value(resolved, tokens, variant)
    return resolved


# TODO Bug 2050893 - review this function and how it ties in with additional_backgrounds_alignment
# This resolves interpolations with the syntax on the tokens files, like:
#   {promo.border.width} solid {promo.border.color.@base}
def resolve_value(value, tokens, variant):
    if isinstance(value, list):
        return [resolve_value(item, tokens, variant) for item in value]
    if not isinstance(value, str):
        return value
    return re.sub(
        r"\{([^}]+)\}", lambda m: str(resolve_ref(m.group(1), tokens, variant)), value
    )


def resolve_section(section, tokens, variant):
    if not section:
        return
    for key, value in section.items():
        section[key] = resolve_value(value, tokens, variant)


def _deep_merge(base, override):
    for key, val in override.items():
        if isinstance(base.get(key), dict) and isinstance(val, dict):
            _deep_merge(base[key], val)
        else:
            base[key] = val


def process_tokens(output_manifest, input_manifest, *token_files):
    merged_tokens = {}
    for token_file in token_files:
        namespace = os.path.basename(token_file).split(".")[0]
        content = json.loads(open(token_file).read())
        _deep_merge(merged_tokens.setdefault(namespace, {}), content)
    manifest = json.loads(open(input_manifest).read())

    for theme in ["theme", "dark_theme"]:
        if theme not in manifest:
            continue
        variant = "dark" if theme == "dark_theme" else "light"
        for section in ["colors", "properties"]:
            if section in manifest[theme]:
                resolve_section(manifest[theme][section], merged_tokens, variant)

    output_manifest.write(json.dumps(manifest, indent=2).encode("utf-8"))
