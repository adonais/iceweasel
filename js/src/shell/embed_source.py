# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Embed a JS source file in the shell as a null-terminated char array.


def main(output, source, name):
    with open(source, "rb") as f:
        data = f.read()
    output.write(f"/* Generated from {source}. Do not edit. */\n")
    output.write(f"static const char {name}[] = {{\n")
    for i in range(0, len(data), 16):
        output.write(", ".join(str(b) for b in data[i : i + 16]) + ",\n")
    output.write("0};\n")
