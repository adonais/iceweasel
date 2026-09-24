# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Write the linker input naming the symbols a pattern file selects.

A linker needs literal names, so the patterns are resolved against the static
library the shared library is linked from. The input holds one glob per line,
optionally followed by the "@DATA@" marker generate_symbols_file.py uses for a
symbol that points at data rather than code. It takes no preprocessor
directives, unlike the full SYMBOLS_FILE syntax that script accepts.

A module definition file both exports the matching names and keeps the archive
members that define them. The undefined symbol roots written for ELF and
Mach-O only keep those members, since a shared library on those targets
controls its exports through the list SYMBOLS_FILE generates.
"""

import argparse
import fnmatch
import re
import struct
import sys
from collections import namedtuple
from functools import partial

PREPROCESSOR_DIRECTIVE = re.compile(r"#[a-z]+(?:\s+.*)?")
GLOB_CHARACTERS = frozenset("*?[")
DATA_ANNOTATION = "@DATA@"
ARCHIVE_MAGIC = b"!<arch>\n"
MEMBER_HEADER = struct.Struct("=16s12s6s6s8s10s2s")

Pattern = namedtuple("Pattern", ("text", "data"))
Match = namedtuple("Match", ("symbol", "data"))


def contains_glob_characters(pattern):
    """Say whether a pattern selects by glob rather than by literal name."""
    return not GLOB_CHARACTERS.isdisjoint(pattern)


def read_archive_symbols(path):
    """Read the public symbols from a static library's symbol index.

    A static library is an ar archive whatever object format its members hold,
    so the member header read here follows the ar layout rather than anything
    the object format defines. A System V or COFF archive names its index "/"
    and stores it big endian, while a BSD archive, which is what a Mach-O
    target produces, names it "__.SYMDEF" and stores it little endian.
    """
    with open(path, "rb") as fh:
        if fh.read(len(ARCHIVE_MAGIC)) != ARCHIVE_MAGIC:
            raise ValueError(f"{path} is not a static library")
        # See https://en.wikipedia.org/wiki/Ar_(Unix) for a description of the
        # header and symbol table format
        identifier, _, _, _, _, raw_size, _ = MEMBER_HEADER.unpack(
            fh.read(MEMBER_HEADER.size)
        )
        size = int(raw_size)
        identifier = identifier.rstrip()
        # A BSD archive stores a member name longer than the header field at
        # the front of the member, and counts it against the member size.
        if identifier.startswith(b"#1/"):
            name_length = int(identifier[3:])
            identifier = fh.read(name_length).rstrip(b"\0")
            size -= name_length
        index = fh.read(size)

    # A sorted BSD index is named "__.SYMDEF SORTED".
    name = identifier.split(b" ")[0]
    if name in (b"/", b"/SYM64/"):
        entry = ">Q" if name == b"/SYM64/" else ">I"
        width = struct.calcsize(entry)
        (count,) = struct.unpack_from(entry, index)
        names_offset = width + width * count
    elif name in (b"__.SYMDEF", b"__.SYMDEF_64"):
        entry = "<Q" if name == b"__.SYMDEF_64" else "<I"
        width = struct.calcsize(entry)
        (table_size,) = struct.unpack_from(entry, index)
        names_offset = width + table_size + width
    else:
        raise ValueError(f"{path} has no symbol index")

    names = index[names_offset:].split(b"\0")
    return [name.decode("utf-8") for name in names if name]


def read_symbol_patterns(path):
    """Read the symbol name patterns of a pattern file.

    Each line holds one glob and may end in "@DATA@". A preprocessor directive
    is rejected rather than taken as a pattern, which would otherwise select
    every branch of a conditional at once.
    """
    patterns = []
    with open(path) as fh:
        for lineno, raw_line in enumerate(fh, 1):
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("#"):
                if PREPROCESSOR_DIRECTIVE.fullmatch(line):
                    raise ValueError(
                        f"{path}:{lineno}: preprocessor directives are not supported"
                    )
                continue
            fields = line.split()
            data = len(fields) == 2 and fields[1] == DATA_ANNOTATION
            if len(fields) > 1 and not data:
                raise ValueError(
                    f"{path}:{lineno}: expected one symbol name pattern, got {line!r}"
                )
            patterns.append(Pattern(fields[0], data))
    return patterns


def resolve_symbols(symbols, patterns, leading_underscore):
    """Map each matching ABI name to the archive symbol and what it points at.

    Targets that decorate cdecl symbols with a leading underscore define them
    under the decorated name, while a consumer resolving by name asks for the
    undecorated one. The patterns describe the undecorated ABI, so the two
    spellings are kept apart.
    """
    found = {}
    for symbol in symbols:
        if leading_underscore and symbol.startswith("_"):
            name = symbol[1:]
        else:
            name = symbol
        for pattern in patterns:
            if not fnmatch.fnmatchcase(name, pattern.text):
                continue
            if name in found:
                raise ValueError(
                    f"{found[name].symbol} and {symbol} both resolve to {name}"
                )
            found[name] = Match(symbol, pattern.data)
            break
    return found


def unmatched_literals(found, patterns):
    """Return literal patterns that matched no archive symbol."""
    return sorted(
        p.text
        for p in patterns
        if not contains_glob_characters(p.text) and p.text not in found
    )


def write_module_definition(output, found):
    """Write the EXPORTS section link.exe reads from a module definition.

    An export that points at data needs the DATA keyword, without which the
    import library entry describes it as code.
    """
    output.write("EXPORTS\n")
    for name, match in sorted(found.items()):
        spelling = name if name == match.symbol else f"{name}={match.symbol}"
        output.write(f"    {spelling} DATA\n" if match.data else f"    {spelling}\n")


def write_undefined_roots(output, found, flag):
    """Write one undefined symbol root per line of a linker response file.

    A root only keeps the archive member that defines the symbol, so it reads
    the same whether the symbol points at code or at data.
    """
    for _, match in sorted(found.items()):
        output.write(f"{flag}{match.symbol}\n")


Format = namedtuple("Format", ("leading_underscore", "write"))

FORMATS = {
    "def": Format(True, write_module_definition),
    "elf": Format(False, partial(write_undefined_roots, flag="--undefined=")),
    "macho": Format(True, partial(write_undefined_roots, flag="-u ")),
}


def main(output, *argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("library", help="static library to read symbols from")
    parser.add_argument("symbols_file", help="file listing symbol name patterns")
    parser.add_argument(
        "--format",
        dest="output_format",
        required=True,
        choices=sorted(FORMATS),
        help="linker input to write, either a module definition file for "
        "link.exe or undefined symbol roots the linker reads as a response file",
    )
    args = parser.parse_args(argv)
    output_format = FORMATS[args.output_format]

    patterns = read_symbol_patterns(args.symbols_file)
    if not patterns:
        print(
            f"error: no symbol patterns found in {args.symbols_file}", file=sys.stderr
        )
        return 1

    found = resolve_symbols(
        read_archive_symbols(args.library),
        patterns,
        output_format.leading_underscore,
    )
    if not found:
        print(f"error: no matching symbols found in {args.library}", file=sys.stderr)
        return 1

    missing = unmatched_literals(found, patterns)
    if missing:
        print(
            f"error: {args.library} holds no symbol named {', '.join(missing)}",
            file=sys.stderr,
        )
        return 1

    output_format.write(output, found)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.stdout, *sys.argv[1:]))
