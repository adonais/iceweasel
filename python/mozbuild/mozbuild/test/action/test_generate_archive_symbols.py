# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import struct
import unittest
from io import StringIO
from shutil import rmtree
from tempfile import mkdtemp
from unittest.mock import patch

import mozunit

from mozbuild.action.generate_archive_symbols import (
    Pattern,
    contains_glob_characters,
    main,
    read_archive_symbols,
    read_symbol_patterns,
    resolve_symbols,
)

PATTERNS = [
    Pattern("frob_*", False),
    Pattern("blah_*", False),
    Pattern("META_*", True),
    Pattern("exact_name", False),
]


class ArchiveTestCase(unittest.TestCase):
    def setUp(self):
        self.tmpdir = mkdtemp()

    def tearDown(self):
        rmtree(self.tmpdir)

    def member_header(self, identifier, size):
        return identifier.ljust(16) + b" " * 32 + str(size).ljust(10).encode() + b"`\n"

    def write_archive(self, names, magic=b"!<arch>\n", member=b"/"):
        """Write an archive holding only a System V or COFF symbol index."""
        wide = member == b"/SYM64/"
        entry = ">Q" if wide else ">I"
        index = struct.pack(entry, len(names))
        index += b"".join(struct.pack(entry, 0) for _ in names)
        index += b"".join(n.encode("utf-8") + b"\0" for n in names)
        path = os.path.join(self.tmpdir, "test.lib")
        with open(path, "wb") as fh:
            fh.write(magic)
            fh.write(self.member_header(member, len(index)))
            fh.write(index)
        return path

    def write_bsd_archive(self, names, member=b"__.SYMDEF SORTED", wide=False):
        """Write an archive holding only a BSD symbol index."""
        entry = "<Q" if wide else "<I"
        width = struct.calcsize(entry)
        strings = b""
        ranlib = b""
        for name in names:
            ranlib += struct.pack(entry, len(strings)) + struct.pack(entry, 0)
            strings += name.encode("utf-8") + b"\0"
        index = (
            struct.pack(entry, len(ranlib))
            + ranlib
            + struct.pack(entry, len(strings))
            + strings
        )
        # A BSD archive stores the index member's name at the front of the
        # member, padded so the data that follows stays aligned.
        padded = member.ljust((len(member) + width - 1) // width * width, b"\0")
        path = os.path.join(self.tmpdir, "test.a")
        with open(path, "wb") as fh:
            fh.write(b"!<arch>\n")
            fh.write(
                self.member_header(
                    b"#1/" + str(len(padded)).encode(), len(padded) + len(index)
                )
            )
            fh.write(padded)
            fh.write(index)
        return path

    def write_symbols_file(self, lines):
        path = os.path.join(self.tmpdir, "test.symbols")
        with open(path, "w") as fh:
            fh.write("".join(f"{line}\n" for line in lines))
        return path


class TestReadArchiveSymbols(ArchiveTestCase):
    def test_reads_symbol_index(self):
        path = self.write_archive(["frob_one", "_ZN4core3fmt", "blah_two"])
        self.assertEqual(
            read_archive_symbols(path), ["frob_one", "_ZN4core3fmt", "blah_two"]
        )

    def test_reads_a_64_bit_symbol_index(self):
        path = self.write_archive(["frob_one", "blah_two"], member=b"/SYM64/")
        self.assertEqual(read_archive_symbols(path), ["frob_one", "blah_two"])

    def test_reads_a_bsd_symbol_index(self):
        path = self.write_bsd_archive(["_frob_one", "_blah_two"])
        self.assertEqual(read_archive_symbols(path), ["_frob_one", "_blah_two"])

    def test_reads_an_unsorted_bsd_symbol_index(self):
        path = self.write_bsd_archive(["_frob_one"], member=b"__.SYMDEF")
        self.assertEqual(read_archive_symbols(path), ["_frob_one"])

    def test_reads_a_64_bit_bsd_symbol_index(self):
        path = self.write_bsd_archive(
            ["_frob_one", "_blah_two"], member=b"__.SYMDEF_64 SORTED", wide=True
        )
        self.assertEqual(read_archive_symbols(path), ["_frob_one", "_blah_two"])

    def test_rejects_non_archive(self):
        path = self.write_archive(["frob_one"], magic=b"NOTANARC")
        with self.assertRaisesRegex(ValueError, "is not a static library"):
            read_archive_symbols(path)

    def test_rejects_missing_symbol_index(self):
        path = self.write_archive(["frob_one"], member=b"somemember.o/")
        with self.assertRaisesRegex(ValueError, "has no symbol index"):
            read_archive_symbols(path)

    def test_rejects_a_long_member_name_that_is_not_an_index(self):
        path = self.write_bsd_archive(["_frob_one"], member=b"somemember.o")
        with self.assertRaisesRegex(ValueError, "has no symbol index"):
            read_archive_symbols(path)


class TestResolveSymbols(unittest.TestCase):
    def test_matches_families(self):
        self.assertEqual(
            resolve_symbols(
                ["frob_a", "blah_b", "META_C", "exact_name"],
                PATTERNS,
                False,
            ),
            {
                "frob_a": ("frob_a", False),
                "blah_b": ("blah_b", False),
                "META_C": ("META_C", True),
                "exact_name": ("exact_name", False),
            },
        )

    def test_ignores_unrelated_symbols(self):
        self.assertEqual(
            resolve_symbols(["_ZN4core3fmt", "sqlite3_open"], PATTERNS, True), {}
        )

    def test_matches_in_full(self):
        self.assertEqual(resolve_symbols(["exact_name_extra"], PATTERNS, True), {})

    def test_matches_case_sensitively(self):
        self.assertEqual(resolve_symbols(["FROB_a", "meta_c"], PATTERNS, True), {})

    def test_undecorates_leading_underscore(self):
        self.assertEqual(
            resolve_symbols(["_frob_a", "_exact_name"], PATTERNS, True),
            {
                "frob_a": ("_frob_a", False),
                "exact_name": ("_exact_name", False),
            },
        )

    def test_keeps_a_leading_underscore_on_an_undecorated_target(self):
        self.assertEqual(resolve_symbols(["_frob_a"], PATTERNS, False), {})

    def test_no_patterns_matches_nothing(self):
        self.assertEqual(resolve_symbols(["frob_a", "_ZN4core3fmt"], [], True), {})

    def test_rejects_a_decorated_and_undecorated_collision(self):
        with self.assertRaisesRegex(ValueError, "both resolve to frob_a"):
            resolve_symbols(["frob_a", "_frob_a"], PATTERNS, True)


class TestContainsGlobCharacters(unittest.TestCase):
    def test_detects_glob_characters(self):
        self.assertTrue(contains_glob_characters("frob_*"))
        self.assertTrue(contains_glob_characters("frob_?"))
        self.assertTrue(contains_glob_characters("frob_[ab]"))

    def test_accepts_a_literal_name(self):
        self.assertFalse(contains_glob_characters("exact_name"))


class TestReadSymbolPatterns(ArchiveTestCase):
    def test_reads_patterns(self):
        path = self.write_symbols_file(["frob_*", "", "blah_*"])
        self.assertEqual(
            read_symbol_patterns(path), [("frob_*", False), ("blah_*", False)]
        )

    def test_reads_a_data_annotation(self):
        path = self.write_symbols_file(["frob_*", "META_* @DATA@"])
        self.assertEqual(
            read_symbol_patterns(path), [("frob_*", False), ("META_*", True)]
        )

    def test_reads_a_tab_delimited_data_annotation(self):
        path = self.write_symbols_file(["frob_*", "META_*\t@DATA@"])
        self.assertEqual(
            read_symbol_patterns(path), [("frob_*", False), ("META_*", True)]
        )

    def test_rejects_a_tab_delimited_trailing_modifier(self):
        path = self.write_symbols_file(["META_*\tDATA"])
        with self.assertRaisesRegex(ValueError, "expected one symbol name pattern"):
            read_symbol_patterns(path)

    def test_ignores_comments_whatever_their_indent(self):
        path = self.write_symbols_file(["# leading", "    # indented", "frob_*"])
        self.assertEqual(read_symbol_patterns(path), [("frob_*", False)])

    def test_keeps_a_comment_that_only_looks_like_a_directive(self):
        path = self.write_symbols_file(["#bug-123 tracks this", "frob_*"])
        self.assertEqual(read_symbol_patterns(path), [("frob_*", False)])

    def test_rejects_a_trailing_modifier(self):
        path = self.write_symbols_file(["META_* DATA"])
        with self.assertRaisesRegex(ValueError, "expected one symbol name pattern"):
            read_symbol_patterns(path)

    def test_rejects_a_preprocessor_directive(self):
        path = self.write_symbols_file([
            "frob_*",
            "#ifdef MOZ_THING",
            "blah_*",
            "#endif",
        ])
        with self.assertRaisesRegex(ValueError, "directives are not supported"):
            read_symbol_patterns(path)

    def test_rejects_an_indented_preprocessor_directive(self):
        path = self.write_symbols_file(["  #ifdef MOZ_THING", "blah_*", "  #endif"])
        with self.assertRaisesRegex(ValueError, "directives are not supported"):
            read_symbol_patterns(path)

    def test_comment_only_file_has_no_patterns(self):
        path = self.write_symbols_file(["# nothing to export", ""])
        self.assertEqual(read_symbol_patterns(path), [])


class TestMain(ArchiveTestCase):
    def run_main(self, library, symbols, output_format):
        out = StringIO()
        with patch("sys.stderr", new=StringIO()) as err:
            status = main(out, library, symbols, f"--format={output_format}")
        return status, out.getvalue(), err.getvalue()

    def test_writes_def_file(self):
        library = self.write_archive(["_frob_a", "blah_b", "sqlite3_open"])
        symbols = self.write_symbols_file(["frob_*", "blah_*", "META_*"])
        status, out, _ = self.run_main(library, symbols, "def")
        self.assertEqual(status, 0)
        self.assertEqual(out, "EXPORTS\n    blah_b\n    frob_a=_frob_a\n")

    def test_marks_data_exports_in_the_def_file(self):
        library = self.write_archive(["frob_a", "_META_C", "sqlite3_open"])
        symbols = self.write_symbols_file(["frob_*", "META_* @DATA@"])
        status, out, _ = self.run_main(library, symbols, "def")
        self.assertEqual(status, 0)
        self.assertEqual(out, "EXPORTS\n    META_C=_META_C DATA\n    frob_a\n")

    def test_writes_elf_roots(self):
        library = self.write_archive(["frob_a", "blah_b", "sqlite3_open"])
        symbols = self.write_symbols_file(["frob_*", "blah_*", "META_*"])
        status, out, _ = self.run_main(library, symbols, "elf")
        self.assertEqual(status, 0)
        self.assertEqual(out, "--undefined=blah_b\n--undefined=frob_a\n")

    def test_writes_macho_roots(self):
        library = self.write_bsd_archive(["_frob_a", "_blah_b", "_sqlite3_open"])
        symbols = self.write_symbols_file(["frob_*", "blah_*", "META_*"])
        status, out, _ = self.run_main(library, symbols, "macho")
        self.assertEqual(status, 0)
        self.assertEqual(out, "-u _blah_b\n-u _frob_a\n")

    def test_ignores_a_data_annotation_outside_the_def_file(self):
        library = self.write_archive(["frob_a", "META_C"])
        symbols = self.write_symbols_file(["frob_*", "META_* @DATA@"])
        status, out, _ = self.run_main(library, symbols, "elf")
        self.assertEqual(status, 0)
        self.assertEqual(out, "--undefined=META_C\n--undefined=frob_a\n")

    def test_orders_roots_by_abi_name(self):
        library = self.write_archive(["frob_c", "frob_a", "frob_b"])
        symbols = self.write_symbols_file(["frob_*"])
        status, out, _ = self.run_main(library, symbols, "elf")
        self.assertEqual(status, 0)
        self.assertEqual(
            out,
            "--undefined=frob_a\n--undefined=frob_b\n--undefined=frob_c\n",
        )

    def test_allows_an_unmatched_glob(self):
        library = self.write_archive(["frob_a"])
        symbols = self.write_symbols_file(["frob_*", "blah_*"])
        status, out, _ = self.run_main(library, symbols, "elf")
        self.assertEqual(status, 0)
        self.assertEqual(out, "--undefined=frob_a\n")

    def test_fails_when_nothing_matches(self):
        library = self.write_archive(["sqlite3_open"])
        symbols = self.write_symbols_file(p.text for p in PATTERNS)
        status, out, err = self.run_main(library, symbols, "def")
        self.assertEqual(status, 1)
        self.assertEqual(out, "")
        self.assertIn("no matching symbols found", err)

    def test_fails_when_a_literal_pattern_matches_nothing(self):
        library = self.write_archive(["frob_a"])
        symbols = self.write_symbols_file(["frob_*", "exact_name"])
        status, out, err = self.run_main(library, symbols, "def")
        self.assertEqual(status, 1)
        self.assertEqual(out, "")
        self.assertIn("holds no symbol named exact_name", err)

    def test_fails_without_patterns(self):
        library = self.write_archive(["frob_a", "_ZN4core3fmt"])
        symbols = self.write_symbols_file(["# nothing to export"])
        status, out, err = self.run_main(library, symbols, "def")
        self.assertEqual(status, 1)
        self.assertEqual(out, "")
        self.assertIn("no symbol patterns found", err)


if __name__ == "__main__":
    mozunit.main()
