# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Symbol-server I/O and breakpad ``.sym`` parsing for BHR aggregation.

Ported from python_mozetl/mozetl/bhr_collection/bhr_collection.py as part of
the bhr_collection migration. Pure-stdlib relocation; semantics are
unchanged.

The Mozilla symbol server returns text in breakpad's ``.sym`` format. Each
file describes one module: ``PUBLIC`` lines map exported names to addresses,
``FUNC`` lines map function symbols to address ranges. ``make_sym_map``
parses one ``.sym`` blob into a ``{address: symbol}`` dict (plus a sorted
key list for bisecting). ``process_module`` is the per-module pipeline:
fetch the ``.sym``, parse it, resolve each requested offset.

``.sym`` files also carry ``INLINE`` / ``INLINE_ORIGIN`` records describing
functions the compiler inlined into a ``FUNC``. An address inside an inlined
region has no return address on the native BHR stack, so without these records
the same source-level call path can appear as two different native stacks
(depending on each build's inlining decisions) and fail to dedup. ``parse_inlines``
resolves the inline ranges so a single address expands to the full inlined chain
``[FUNC, inline@nest0, inline@nest1, ...]`` (outer-first), which lets equivalent
hangs merge. Because of this, ``process_module`` resolves each offset to a
*list* of ``(symbol, module_name)`` frames (length 1 when there are no inlines).
Inlines are parsed in a second pass targeted at only the functions the requested
offsets landed in, since a debug ``.sym`` holds far more ``INLINE`` records than
we ever need. See bug 2052961.
"""

import contextlib
import gzip
import threading
import urllib.parse
import urllib.request
from bisect import bisect
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO

UNSYMBOLICATED = "<unsymbolicated>"
SYMBOL_TRUNCATE_LENGTH = 200

# Per-socket timeout for symbol-server requests. urlopen with no timeout blocks
# forever on a stalled connection, which deadlocks the whole thread pool (one
# stuck worker never returns, so symbolicate_modules never completes). The
# timeout fires only when a connection delivers no data for this long, so a
# slow-but-progressing download of a large .sym isn't affected; a genuinely
# stalled connection raises, gets retried, and finally falls back to
# unsymbolicated.
_FETCH_TIMEOUT_SECONDS = 60

# How often symbolicate_modules prints progress, so a long run is legible.
_SYMBOLICATE_PROGRESS_EVERY = 500


def make_sym_map(data, url=None):
    public_symbols = {}
    func_symbols = {}

    for raw_line in data.splitlines():
        line = raw_line.decode("utf-8")
        if line.startswith("PUBLIC "):
            stripped = line.rstrip()
            fields = stripped.split(" ", 3)
            m_offset = 0
            if fields[1] == "m":
                m_offset = 1
                fields = stripped.split(" ", 4)
            if len(fields) < 4 + m_offset:
                print(f"Skipping malformed PUBLIC line from {url}: {stripped!r}")
                continue
            try:
                address = int(fields[1 + m_offset], 16)
            except ValueError:
                print(
                    f"Skipping PUBLIC line with non-hex address from {url}: {stripped!r}"
                )
                continue
            symbol = fields[3 + m_offset]
            public_symbols[address] = symbol[:SYMBOL_TRUNCATE_LENGTH]
        elif line.startswith("FUNC "):
            stripped = line.rstrip()
            fields = stripped.split(" ", 4)
            m_offset = 0
            if fields[1] == "m":
                m_offset = 1
                fields = stripped.split(" ", 5)
            if len(fields) == 4 + m_offset:
                symbol = "(no symbol)"
            elif len(fields) < 4 + m_offset:
                print(f"Skipping malformed FUNC line from {url}: {stripped!r}")
                continue
            else:
                symbol = fields[4 + m_offset]
            try:
                address = int(fields[1 + m_offset], 16)
            except ValueError:
                print(
                    f"Skipping FUNC line with non-hex address from {url}: {stripped!r}"
                )
                continue
            func_symbols[address] = symbol[:SYMBOL_TRUNCATE_LENGTH]
    # Prioritize PUBLIC symbols over FUNC ones
    sym_map = func_symbols
    sym_map.update(public_symbols)

    return sorted(sym_map), sym_map


def _func_start_address(func_line):
    """Return the start address of a ``FUNC`` line, or None if unparseable.

    Mirrors the address extraction in make_sym_map (including the ``m`` prefix)
    so parse_inlines associates INLINE records with the same FUNC addresses.
    """
    stripped = func_line.rstrip()
    fields = stripped.split(" ", 4)
    m_offset = 1 if len(fields) > 1 and fields[1] == "m" else 0
    try:
        return int(fields[1 + m_offset], 16)
    except (ValueError, IndexError):
        return None


def parse_inlines(data, wanted_func_addrs):
    """Resolve inline records, but only for the given FUNC start addresses.

    A debug ``.sym`` (e.g. xul) carries a very large number of ``INLINE``
    records, and parsing/holding them all is expensive in both CPU and memory
    when only a handful of offsets are queried per module. So this is a second,
    targeted pass: it fully parses an ``INLINE`` line only when its enclosing
    ``FUNC`` is in ``wanted_func_addrs`` (the funcs the requested offsets landed
    in). ``INLINE_ORIGIN`` records are few, so they're all collected and used to
    resolve origin ids to names.

    Returns ``{func_start_address: [(nest_level, name, [(lo, hi), ...]), ...]}``.
    """
    if not wanted_func_addrs:
        return {}

    inline_origins = {}
    raw_inlines = {}  # func_start_address -> [(nest_level, origin_id, ranges), ...]
    current_func_addr = None

    for raw_line in data.splitlines():
        line = raw_line.decode("utf-8")
        if line.startswith("FUNC "):
            current_func_addr = _func_start_address(line)
        elif line.startswith("PUBLIC "):
            current_func_addr = None
        elif line.startswith("INLINE_ORIGIN "):
            # "INLINE_ORIGIN <id> <name>" (name runs to end of line).
            fields = line.rstrip().split(" ", 2)
            if len(fields) < 3:
                continue
            try:
                origin_id = int(fields[1])
            except ValueError:
                continue
            inline_origins[origin_id] = fields[2][:SYMBOL_TRUNCATE_LENGTH]
        elif line.startswith("INLINE "):
            # "INLINE <nest_level> <call_site_line> <call_site_file> <origin_id>
            #  [<address> <size>]+"; the INLINE belongs to the last FUNC seen.
            # Skip the expensive parse unless this FUNC was actually queried.
            if current_func_addr not in wanted_func_addrs:
                continue
            fields = line.split()
            if len(fields) < 7:
                continue
            try:
                nest_level = int(fields[1])
                origin_id = int(fields[4])
                nums = [int(x, 16) for x in fields[5:]]
            except ValueError:
                continue
            # address/size come in pairs; an inline can have several disjoint
            # ranges. Ignore a trailing unpaired field defensively.
            ranges = [
                (nums[k], nums[k] + nums[k + 1]) for k in range(0, len(nums) - 1, 2)
            ]
            if ranges:
                raw_inlines.setdefault(current_func_addr, []).append((
                    nest_level,
                    origin_id,
                    ranges,
                ))

    # Resolve origin ids to names now that every INLINE_ORIGIN line is seen.
    func_inlines = {}
    for func_addr, records in raw_inlines.items():
        resolved = [
            (nest_level, inline_origins[origin_id], ranges)
            for (nest_level, origin_id, ranges) in records
            if origin_id in inline_origins
        ]
        if resolved:
            func_inlines[func_addr] = resolved

    return func_inlines


def _inline_chain(inlines, address):
    """Inlined function names covering `address`, outer-first (nest 0 first).

    `inlines` is the enclosing FUNC's resolved records from make_sym_map, each
    ``(nest_level, name, [(lo, hi), ...])``. We keep the ones whose range covers
    the address and order them by nest level, so the caller can splice them right
    after the FUNC frame to rebuild the source-level call chain.
    """
    if not inlines or address is None:
        return []
    covering = [
        (nest_level, name)
        for (nest_level, name, ranges) in inlines
        if any(lo <= address < hi for (lo, hi) in ranges)
    ]
    covering.sort(key=lambda item: item[0])
    return [name for (_nest, name) in covering]


def get_file_url(module, config):
    lib_name, breakpad_id = module
    if lib_name is None or breakpad_id is None:
        return None
    if lib_name.endswith(".pdb"):
        file_name = lib_name[:-4] + ".sym"
    else:
        file_name = lib_name + ".sym"

    try:
        return config["symbol_server_url"] + "/".join([
            urllib.parse.quote_plus(lib_name),
            urllib.parse.quote_plus(breakpad_id),
            urllib.parse.quote_plus(file_name),
        ])
    except KeyError:
        # urllib throws with unicode strings. TODO: investigate why
        # any of these values (lib_name, breakpad_id, file_name) would
        # have unicode strings, or if this is just bad pings.
        return None


# Symbol-fetch errors are logged once per exception type, so a systemic failure
# (an SSL, proxy, or DNS error that makes every fetch fail) names its cause in
# the log instead of being swallowed, without flooding it with a line per fetch.
# OS-library fetches that legitimately 404 are not errors and are not logged.
_fetch_error_lock = threading.Lock()
_logged_fetch_error_types = set()


def _log_fetch_error(url, error):
    error_type = type(error).__name__
    with _fetch_error_lock:
        if error_type in _logged_fetch_error_types:
            return
        _logged_fetch_error_types.add(error_type)
    print(f"  Symbol fetch failed ({error_type}): {error} [{url}]", flush=True)


def fetch_url(url):
    result = False, ""
    last_error = None
    try:
        with contextlib.closing(
            urllib.request.urlopen(url, timeout=_FETCH_TIMEOUT_SECONDS)
        ) as response:
            response_code = response.getcode()
            if response_code == 404:
                return False, ""
            if response_code != 200:
                result = False, ""
            return True, decode_response(response)
    except OSError as error:
        last_error = error
        result = False, ""

    if not result[0]:
        try:
            with contextlib.closing(
                urllib.request.urlopen(url, timeout=_FETCH_TIMEOUT_SECONDS)
            ) as response:
                response_code = response.getcode()
                if response_code == 404:
                    return False, ""
                if response_code != 200:
                    result = False, ""
                return True, decode_response(response)
        except OSError as error:
            last_error = error
            result = False, ""

    # Reached only when both attempts failed. Surface a network/TLS/proxy error
    # (the silent OSError that makes a broken run look clean) by naming it.
    if last_error is not None:
        _log_fetch_error(url, last_error)
    return result


def decode_response(response):
    headers = response.info()
    content_encoding = headers.get("Content-Encoding", "").lower()
    if content_encoding in ("gzip", "x-gzip", "deflate"):
        with contextlib.closing(BytesIO(response.read())) as data_stream:
            try:
                with gzip.GzipFile(fileobj=data_stream) as f:
                    return f.read()
            except OSError:
                data_stream.seek(0)
                return data_stream.read().decode("zlib")
    return response.read()


def process_module(module, offsets, config):
    # Each offset resolves to a LIST of (symbol, module_name) frames: just the
    # FUNC/PUBLIC symbol when there are no inlines, or the FUNC followed by its
    # inlined chain (outer-first) when the address sits inside inlined code.
    result = []
    if module is None or module[0] is None:
        return [((module, offset), [(UNSYMBOLICATED, "unknown")]) for offset in offsets]
    if module[0] == "pseudo":
        return [
            ((module, offset), [("" if offset is None else offset, "")])
            for offset in offsets
        ]
    file_url = get_file_url(module, config)
    module_name = module[0]
    if file_url:
        success, response = fetch_url(file_url)
    else:
        success = False

    if success:
        sorted_keys, sym_map = make_sym_map(response, file_url)
        if not sym_map:
            print(f"Warning: Empty sym map from {file_url}; treating as failure")
            success = False

    if success:
        # Resolve every offset to its symbol address/key first, so inline records
        # are parsed for just the funcs we actually landed in (see parse_inlines).
        resolved = {}
        wanted_func_addrs = set()
        for offset in offsets:
            try:
                address = int(offset, 16)
                i = bisect(sorted_keys, address)
                key = sorted_keys[i - 1] if i else None
            except (UnicodeEncodeError, ValueError):
                address = None
                key = None
            resolved[offset] = (address, key)
            if key is not None:
                wanted_func_addrs.add(key)

        func_inlines = parse_inlines(response, wanted_func_addrs)
        response = None

        for offset in offsets:
            address, key = resolved[offset]
            symbol = sym_map.get(key) if key is not None else None
            if symbol is not None:
                frames = [(symbol, module_name)]
                frames.extend(
                    (name, module_name)
                    for name in _inline_chain(func_inlines.get(key), address)
                )
                result.append(((module, offset), frames))
            else:
                result.append(((module, offset), [(UNSYMBOLICATED, module_name)]))
    else:
        for offset in offsets:
            result.append(((module, offset), [(UNSYMBOLICATED, module_name)]))
    return result


def symbolicate_modules(frames_by_module, config, max_workers=16):
    """Symbolicate (module, offset) pairs in parallel via a thread pool.

    Calls process_module() once per module, dispatching the calls to a
    ThreadPoolExecutor. Symbol fetching is I/O-bound (HTTP requests to
    symbols.mozilla.org), so threads are the right tool: the GIL doesn't
    matter on network I/O, and threads are cheaper than processes.

    Replaces the PySpark RDD.flatMap(process_module) pattern from the
    python_mozetl version with plain Python parallelism.

    Args:
        frames_by_module: dict mapping module to an iterable of offsets.
            Modules are the (debug_name, breakpad_id) tuples produced by
            process_frame, or None / ("pseudo", None) for special cases.
        config: dict with symbol_server_url; forwarded to process_module.
        max_workers: thread pool size. Kept modest because each concurrent
            worker may hold a large .sym file (xul is ~1 GB uncompressed)
            plus its parsed symbol map, so the pool size is the main lever
            on peak memory.

    Returns:
        dict mapping (module, offset) to a list of (symbol, module_name)
        frames (usually one, more when the address resolves inside inlined
        code). A failed lookup is a single (UNSYMBOLICATED, module_name) frame,
        matching process_module's failure mode.
    """
    if not frames_by_module:
        return {}

    total = len(frames_by_module)
    result = {}
    # Track resolved vs unsymbolicated frames separately. Counting every entry
    # as "resolved" hid total symbol-fetch failures behind a healthy-looking
    # counter: a failed fetch falls back to [(UNSYMBOLICATED, ...)] but still
    # counted the same as a real resolution.
    resolved = 0
    unsymbolicated = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(process_module, module, list(offsets), config)
            for module, offsets in frames_by_module.items()
        ]
        # Collect in completion order (not submission order) so progress
        # reflects work actually finishing, and one slow module doesn't make
        # the whole phase look stalled. Result keys are unique per module, so
        # ordering doesn't affect the output.
        for done, future in enumerate(as_completed(futures), 1):
            for key, value in future.result():
                result[key] = value
                # value is a list of frames; a fallback is a single
                # (UNSYMBOLICATED, module_name) frame.
                if value[0][0] == UNSYMBOLICATED:
                    unsymbolicated += 1
                else:
                    resolved += 1
            if done % _SYMBOLICATE_PROGRESS_EVERY == 0 or done == total:
                print(
                    f"  ...symbolicated {done}/{total} modules "
                    f"({resolved} resolved, {unsymbolicated} unsymbolicated)",
                    flush=True,
                )
    if unsymbolicated > resolved:
        print(
            f"  WARNING: {unsymbolicated} of {resolved + unsymbolicated} frames "
            "are unsymbolicated; symbol fetching is likely failing (check access "
            "to the symbol server).",
            flush=True,
        )
    return result
