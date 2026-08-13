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
    result = []
    if module is None or module[0] is None:
        return [((module, offset), (UNSYMBOLICATED, "unknown")) for offset in offsets]
    if module[0] == "pseudo":
        return [
            ((module, offset), ("" if offset is None else offset, ""))
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
        response = None
        if not sym_map:
            print(f"Warning: Empty sym map from {file_url}; treating as failure")
            success = False

    if success:
        for offset in offsets:
            try:
                i = bisect(sorted_keys, int(offset, 16))
                key = sorted_keys[i - 1] if i else None
                symbol = sym_map.get(key)
            except UnicodeEncodeError:
                symbol = None
            except ValueError:
                symbol = None
            if symbol is not None:
                result.append(((module, offset), (symbol, module_name)))
            else:
                result.append(((module, offset), (UNSYMBOLICATED, module_name)))
    else:
        for offset in offsets:
            result.append(((module, offset), (UNSYMBOLICATED, module_name)))
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
        dict mapping (module, offset) to (symbol, module_name). Missing
        symbols are represented as (UNSYMBOLICATED, module_name) entries,
        matching process_module's failure mode.
    """
    if not frames_by_module:
        return {}

    total = len(frames_by_module)
    result = {}
    # Track resolved vs unsymbolicated frames separately. Counting every entry
    # as "resolved" hid total symbol-fetch failures behind a healthy-looking
    # counter: a failed fetch falls back to (UNSYMBOLICATED, ...) but still
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
                if value[0] == UNSYMBOLICATED:
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
