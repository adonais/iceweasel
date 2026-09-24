#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Generate an assembly file that embeds Metal shader source for runtime compilation.
This allows cross-compilation from Linux without requiring the Metal compiler (xcrun).
This is inspired from upstream's CMake build system
https://github.com/ggml-org/ggml/blob/72632094336524a9c809e129e8b1c52154543a5a/src/ggml-metal/CMakeLists.txt#L47-L61
"""

import hashlib
import os
import sys


def main(output, *args):
    """
    Generate assembly file with embedded Metal shader source.

    Args:
        output: Output .s file
        *args: Input files (ggml-common.h, ggml-metal-impl.h, ggml-metal.metal)
    """
    if len(args) != 3:
        raise ValueError(f"Expected 3 input files, got {len(args)}")

    common_h_path, impl_h_path, metal_src_path = args

    with open(common_h_path, encoding="utf-8") as f:
        common_h = f.read()

    with open(impl_h_path, encoding="utf-8") as f:
        impl_h = f.read()

    with open(metal_src_path, encoding="utf-8") as f:
        metal_src = f.read()

    # Replace placeholders to merge headers into Metal source
    # This mimics what the CMake build does with sed commands
    metal_src = metal_src.replace("__embed_ggml-common.h__", common_h)
    metal_src = metal_src.replace('#include "ggml-metal-impl.h"', impl_h)

    # Get the actual output path from the FileAvoidWrite object
    output_path = output.name if hasattr(output, "name") else str(output)
    output_dir = os.path.dirname(os.path.abspath(output_path))
    merged_metal_path = os.path.join(output_dir, "ggml-metal-embed.metal")

    # Write merged Metal source to a temporary file
    # We need an actual file for .incbin to reference
    with open(merged_metal_path, "w", encoding="utf-8") as f:
        f.write(metal_src)

    # Generate assembly file that embeds the Metal source
    # The symbols ggml_metallib_start and ggml_metallib_end will be
    # referenced from ggml-metal.m at runtime to access the embedded shader
    # source. The shader is compiled on first run and then cached by the OS, so
    # it is not horribly inneficient (vs. e.g. precompiling at build time).
    # .incbin is not tracked as a dependency, so the digest is what makes a
    # shader edit change this file and reassemble the object.
    digest = hashlib.sha256(metal_src.encode("utf-8")).hexdigest()

    asm_content = f'''.section __DATA,__ggml_metallib
/* shader digest: {digest} */
.globl _ggml_metallib_start
_ggml_metallib_start:
.incbin "{merged_metal_path}"
.globl _ggml_metallib_end
_ggml_metallib_end:
'''

    # Write assembly file using the file-like object
    output.write(asm_content)

    print(f"Generated {output_path} with embedded Metal shader source ({len(metal_src)} bytes)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(
            "Usage: generate_metal_embed.py <output.s> <ggml-common.h> <ggml-metal-impl.h> <ggml-metal.metal>",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(sys.argv[1], "w") as output:
        sys.exit(main(output, *sys.argv[2:]))
