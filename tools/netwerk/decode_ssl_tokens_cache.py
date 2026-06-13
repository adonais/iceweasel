#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Decode and display the contents of an ssl_tokens_cache.bin file.

File format (see netwerk/base/ssl_tokens_cache/README.md for full specification):
  magic:   4 bytes  b"STCF"
  version: 1 byte   (currently 2)
  body:    zlib-compressed bincode-1.3 Vec<PersistedRecord>
"""

import argparse
import datetime
import io
import os
import struct
import sys
import types
import warnings
import zlib
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TypeVar, cast

_x509: types.ModuleType | None
try:
    from cryptography import x509 as _x509
except ImportError:
    _x509 = None

MAGIC = b"STCF"
SUPPORTED_VERSION = 2


@dataclass(frozen=True)
class _Color:
    """ANSI color codes; all empty strings when color is disabled."""

    reset: str = ""
    bold: str = ""
    dim: str = ""
    red: str = ""
    cyan: str = ""

    @classmethod
    def from_bool(cls, on: bool) -> "_Color":
        if not on:
            return cls()
        return cls(
            reset="\033[0m",
            bold="\033[1m",
            dim="\033[2m",
            red="\033[31m",
            cyan="\033[36m",
        )


# Populated in main() once we know whether --color was passed.
C: _Color = _Color()

T = TypeVar("T")


class DecodeError(Exception):
    pass


@dataclass
class Record:
    key: str
    expires: datetime.datetime
    token: bytes
    ev_status: int
    ct_status: int
    overridable_error: int
    server_cert: bytes
    succeeded_cert_chain: list[bytes] | None
    handshake_certs: list[bytes] | None
    built_in_root: bool | None
    size: int = 0


class Reader:
    """Minimal bincode-1.3 (little-endian, u64 lengths) stream reader."""

    _U8 = struct.Struct("<B")
    _U16 = struct.Struct("<H")
    _U64 = struct.Struct("<Q")
    _I64 = struct.Struct("<q")

    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)
        self._len = len(data)

    def remaining(self) -> int:
        return self._len - self._buf.tell()

    def _read(self, n: int) -> bytes:
        chunk = self._buf.read(n)
        if len(chunk) != n:
            raise DecodeError(
                f"truncated: need {n} bytes at offset {self._buf.tell()}, "
                f"only {len(chunk)} available"
            )
        return chunk

    def _unpack(self, fmt: struct.Struct) -> int:
        (value,) = fmt.unpack(self._read(fmt.size))
        return cast(int, value)

    def u8(self) -> int:
        return self._unpack(self._U8)

    def u16(self) -> int:
        return self._unpack(self._U16)

    def u64(self) -> int:
        return self._unpack(self._U64)

    def i64(self) -> int:
        return self._unpack(self._I64)

    def read_bool(self) -> bool:
        return self.u8() != 0

    def bytes_vec(self) -> bytes:
        return self._read(self.u64())

    def vec_of_bytes(self) -> list[bytes]:
        return [self.bytes_vec() for _ in range(self.u64())]

    def option(self, f: Callable[[], T]) -> T | None:
        tag = self.u8()
        if tag == 0:
            return None
        if tag == 1:
            return f()
        raise DecodeError(f"invalid Option discriminant {tag}")

    def record(self) -> Record:
        start = self._buf.tell()
        self.u64()  # session-internal id, re-assigned on load; not displayed
        key = self.bytes_vec().decode("utf-8", errors="replace")
        prtime = self.i64()
        expires = datetime.datetime.fromtimestamp(
            prtime / 1e6, tz=datetime.timezone.utc
        )
        rec = Record(
            key=key,
            expires=expires,
            token=self.bytes_vec(),
            ev_status=self.u8(),
            ct_status=self.u16(),
            overridable_error=self.u8(),
            server_cert=self.bytes_vec(),
            succeeded_cert_chain=self.option(self.vec_of_bytes),
            handshake_certs=self.option(self.vec_of_bytes),
            built_in_root=self.option(self.read_bool),
        )
        rec.size = self._buf.tell() - start
        return rec

    def records(self) -> list[Record]:
        return [self.record() for _ in range(self.u64())]


@lru_cache(maxsize=256)
def cert_subject(der: bytes) -> str:
    if _x509 is not None:
        try:
            return str(_x509.load_der_x509_certificate(der).subject.rfc4514_string())
        except Exception:
            pass
    return f"<{len(der)} bytes DER>"


def _row(label: str, value: str) -> str:
    return f"  {C.dim}{label + ':':<14}{C.reset}{value}"


def _print_cert_chain(label: str, chain: list[bytes] | None, verbose: int) -> None:
    if chain is None:
        return
    print(_row(label, f"{len(chain)} cert(s)"))
    if verbose >= 1:
        for i, der in enumerate(chain):
            print(f"    [{i}] {C.cyan}{cert_subject(der)}{C.reset}")


def hexdump(data: bytes, indent: str = "  ") -> None:
    for off in range(0, len(data), 16):
        chunk = data[off : off + 16]
        hex_part = " ".join(f"{b:02x}" for b in chunk)
        asc_part = "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in chunk)
        print(
            f"{indent}{C.dim}{off:04x}{C.reset}  {hex_part:<47}  {C.dim}{asc_part}{C.reset}"
        )


def print_record(idx: int, rec: Record, verbose: int, now: datetime.datetime) -> None:
    expired = f" {C.red}{C.bold}[EXPIRED]{C.reset}" if rec.expires < now else ""

    print(f"[{idx}] {C.bold}{rec.key}{C.reset}  {C.dim}{rec.size:,} bytes{C.reset}")
    print(_row("expires", rec.expires.strftime("%Y-%m-%d %H:%M:%S UTC") + expired))
    print(_row("token", f"{len(rec.token)} bytes"))
    if verbose >= 2:
        hexdump(rec.token, indent="    ")

    flags = f"ev={rec.ev_status} ct={rec.ct_status} ovr_error={rec.overridable_error}"
    if rec.built_in_root is not None:
        flags += f" built_in_root={rec.built_in_root}"
    print(_row("flags", flags))

    if rec.server_cert:
        print(_row("server_cert", f"{C.cyan}{cert_subject(rec.server_cert)}{C.reset}"))

    _print_cert_chain("chain", rec.succeeded_cert_chain, verbose)
    _print_cert_chain("hs_certs", rec.handshake_certs, verbose)


def decode(path: str, verbose: int) -> None:
    data = Path(path).read_bytes()

    if len(data) < 5:
        raise DecodeError("file too short to contain header")
    magic, version = data[:4], data[4]
    if magic != MAGIC:
        raise DecodeError(f"bad magic: expected {MAGIC!r}, got {magic!r}")
    if version != SUPPORTED_VERSION:
        raise DecodeError(
            f"unsupported version {version} "
            f"(this script handles version {SUPPORTED_VERSION})"
        )

    try:
        payload = zlib.decompress(data[5:])
    except zlib.error as e:
        raise DecodeError(f"zlib decompression failed: {e}") from e

    reader = Reader(payload)
    records = reader.records()

    if reader.remaining():
        warnings.warn(
            f"{reader.remaining()} trailing bytes after records", stacklevel=2
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    n_expired = sum(1 for r in records if r.expires < now)
    print(path)
    print(f"  version:  {version}")
    print(f"  records:  {len(records)} ({n_expired} expired)")
    print(
        f"  payload:  {len(payload):,} bytes uncompressed, {len(data) - 5:,} compressed"
    )
    print()

    for i, rec in enumerate(records):
        print_record(i, rec, verbose, now)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decode an ssl_tokens_cache.bin file from a Firefox profile."
    )
    parser.add_argument("file", help="path to ssl_tokens_cache.bin")
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="-v: show cert chain subjects; -vv: also hexdump token bytes",
    )
    parser.add_argument(
        "--color",
        action="store_true",
        help="force color output even when piped (e.g. | less -R)",
    )
    args = parser.parse_args()

    global C  # noqa: PLW0603
    C = _Color.from_bool(
        (args.color or sys.stdout.isatty()) and "NO_COLOR" not in os.environ
    )

    try:
        decode(args.file, args.verbose)
    except (DecodeError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
