#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


import argparse
import io
import os
import subprocess
import sys
import tarfile

import zstandard


class ProcError(Exception):
    def __init__(self, returncode, stderr):
        self.returncode = returncode
        self.stderr = stderr


def check_output(command):
    proc = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True
    )
    stdout, stderr = proc.communicate()
    if proc.returncode != 0:
        raise ProcError(proc.returncode, stderr)
    return stdout


def process_file(dump_syms, path):
    try:
        stdout = check_output([dump_syms, path])
    except ProcError as e:
        print('Error: running "%s %s": %s' % (dump_syms, path, e.stderr))
        return None, None, None, None
    bits = stdout.splitlines()[0].split(" ", 4)
    if len(bits) != 5:
        return None, None, None, None
    _, platform, cpu_arch, debug_id, debug_file = bits
    if debug_file.lower().endswith(".pdb"):
        sym_file = debug_file[:-4] + ".sym"
    else:
        sym_file = debug_file + ".sym"
    filename = os.path.join(debug_file, debug_id, sym_file)
    # Binaries must never be packaged, as they must not be redistributed through
    # the symbol server. On Windows, dump_syms reads the PDB found next to the
    # binary and reports it as the debug file; that PDB is packaged.
    pdb_path = pdb_arcname = None
    if debug_file.lower().endswith(".pdb"):
        pdb_path = os.path.join(os.path.dirname(path), debug_file)
        pdb_arcname = os.path.join(debug_file, debug_id, debug_file)
    return filename, stdout, pdb_path, pdb_arcname


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dump_syms", help="Path to dump_syms binary")
    parser.add_argument("files", nargs="+", help="Path to files to dump symbols from")
    parser.add_argument(
        "--symbol-archive",
        default="symbols.tar.zst",
        help="Name of the .tar.zst archive to put dumped symbols in",
    )
    args = parser.parse_args()
    count = 0
    ctx = zstandard.ZstdCompressor(threads=-1)
    with open(args.symbol_archive, "wb") as fh, ctx.stream_writer(fh) as zstdwriter:
        with tarfile.open(mode="w|", fileobj=zstdwriter, bufsize=1024 * 1024) as tar:
            for f in args.files:
                filename, contents, pdb_path, pdb_arcname = process_file(
                    args.dump_syms, f
                )
                if not (filename and contents):
                    print("Error dumping symbols")
                    sys.exit(1)
                data = contents.encode("utf-8")
                info = tarfile.TarInfo(filename)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
                count += 1
                if pdb_path:
                    tar.add(pdb_path, pdb_arcname)
                    count += 1
    print("Added %d files to %s" % (count, args.symbol_archive))


if __name__ == "__main__":
    main()
