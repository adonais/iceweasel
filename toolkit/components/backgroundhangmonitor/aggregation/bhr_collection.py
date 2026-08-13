# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""BigQuery reader for the BHR aggregation pipeline.

Streams hang-report pings from BigQuery for a given build-date window,
filtered down to the columns the downstream pipeline actually consumes.

Ported from the original python_mozetl/mozetl/bhr_collection/bhr_collection.py. The
SQL and FARM_FINGERPRINT-based deterministic sampling are unchanged. The
PySpark BigQuery connector has been replaced with the google-cloud-bigquery
Python client; rows are yielded one at a time rather than materialised into
a Spark DataFrame so memory stays bounded at production sample sizes
(~500K rows × ~5-10 KB each would otherwise need 3-5 GB on a single worker).

The google-cloud-bigquery import is deferred to the call site so this
module can be imported in environments where the package isn't installed
(e.g. unit tests that mock the client). Production runs need the package
present in the runtime — that's handled by the TaskCluster Docker image
in a later phase of the migration.
"""

import json
import os
import time
import uuid
from datetime import timedelta

from heuristics import apply_hang_signature_heuristics
from profile_processor import ProfileProcessor
from symbolication import UNSYMBOLICATED, symbolicate_modules

_BQ_TABLE = "moz-fx-data-shared-prod.firefox_desktop_stable.hang_report_v1"
_MAX_SAMPLE_SLICES = 10000

# Project/dataset where query results are materialized before being read back.
# Large result sets cannot be returned inline, so the query writes to a temp
# table here first. We pin this to mozdata.tmp (independent of the billing
# project) to match the old job, which always materialized to mozdata.tmp while
# billing the query to a separately configured project.
_MATERIALIZATION_PROJECT = "mozdata"
_MATERIALIZATION_DATASET = "tmp"
# Lifetime of the temp result table. Set as an OPTION at table-creation time so
# it applies even if this process dies before it can clean anything up.
_MATERIALIZATION_EXPIRY_HOURS = 6

# How often to print a heartbeat while streaming rows, so a long production run
# visibly makes progress instead of sitting silent.
_PROGRESS_EVERY_ROWS = 10000

# Pipeline defaults. The production CLI in python_mozetl overrode the stale
# 16000 upper bound with 65536, so we use that here for parity. uuid is added
# fresh per run in aggregate().
DEFAULT_CONFIG = {
    "thread_filter": "Gecko",
    "hang_lower_bound": 128,
    "hang_upper_bound": 65536,
    "stack_acceptance_threshold": 0.0,
    "symbol_server_url": "https://symbols.mozilla.org/",
    "print_debug_info": False,
    "split_threads_in_out_file": False,
    "use_minimal_sample_table": False,
    "post_sample_size": 1.0,
    "exclude_modules": False,
}

# Top-level ping fields fetched from BigQuery. Returned in `slash/key` form
# because downstream code (process_hangs, process_module, etc.) expects this
# same shape. exclude_modules drops the hangs_modules column for the cases
# where module info isn't needed downstream.
_BASE_PROPERTIES = (
    "client_info/os",
    "client_info/os_version",
    "client_info/architecture",
    "client_info/app_build",
)


def _properties_for(exclude_modules):
    if exclude_modules:
        return list(_BASE_PROPERTIES) + ["metrics/object/hangs_reports"]
    return list(_BASE_PROPERTIES) + [
        "metrics/object/hangs_modules",
        "metrics/object/hangs_reports",
    ]


def get_prop(val, prop):
    """Walk a slash-delimited property path on a dict-like or Row-like value.

    Returns None if any intermediate node is None, matching the behaviour of
    the python_mozetl version. Works on plain dicts (used in tests) and on
    google.cloud.bigquery.Row objects (used in production).
    """
    if val is None:
        return None

    for key in prop.split("/"):
        val = val[key]
        if val is None:
            return None
    return val


def get_ping_properties(ping, properties):
    return {prop: get_prop(ping, prop) for prop in properties}


def properties_are_not_none(ping, properties):
    return all(ping[prop] is not None for prop in properties)


def ping_is_valid(ping):
    if not isinstance(ping["client_info/os_version"], str):
        return False
    if not isinstance(ping["client_info/os"], str):
        return False
    if not isinstance(ping["client_info/app_build"], str):
        return False
    if ping["metrics/object/hangs_reports"] is None:
        return False
    return True


def compute_sample_slices(sample_size):
    """Translate a fractional sample-size into a discrete slice count.

    The BigQuery query uses ``ABS(MOD(FARM_FINGERPRINT(document_id), 10000)) < N``
    to deterministically sample pings. N here is the slice count: sample-size
    1.0 → 10000 slices (everything), 0.5 → 5000, 0.0002 → 2, etc. Clamped to
    at least 1 so a misconfigured 0 doesn't accidentally read zero rows.
    """
    raw = _MAX_SAMPLE_SLICES * sample_size
    return int(max(min(raw, _MAX_SAMPLE_SLICES), 1))


def build_query_sql(date, end_date, sample_slices):
    """Build the BigQuery SQL string. Pure function — no client needed.

    Exposed (rather than inlined into get_data) so tests can verify the
    SQL shape without mocking the BQ client.

    The submission window is the build-date window padded by 5 days on each
    side (a build's pings keep arriving for a few days). The build-date filter
    itself is done here in SQL rather than in Python: the old python_mozetl job
    fetched the whole submission window and filtered build dates client-side,
    which means streaming ~10 days of builds just to keep one day's worth.
    Filtering in SQL cuts the result set (and the runtime) by roughly that
    factor.

    Only the handful of fields the pipeline actually reads are selected, not the
    whole client_info/metrics records (metrics in particular is large). They're
    rebuilt as STRUCTs so the rows keep the same nested shape get_prop expects
    (client_info.os, metrics.object.hangs_reports, ...).
    """
    submission_start = date - timedelta(days=5)
    submission_end = end_date + timedelta(days=5)
    date_str = date.strftime("%Y%m%d")
    end_date_str = end_date.strftime("%Y%m%d")
    return f"""
    SELECT
      STRUCT(
        client_info.os AS os,
        client_info.os_version AS os_version,
        client_info.architecture AS architecture,
        client_info.app_build AS app_build
      ) AS client_info,
      STRUCT(
        STRUCT(
          metrics.object.hangs_modules AS hangs_modules,
          metrics.object.hangs_reports AS hangs_reports
        ) AS object
      ) AS metrics
    FROM
      `{_BQ_TABLE}`
    WHERE
      -- Use document_id to sample
      ABS(MOD(FARM_FINGERPRINT(document_id), {_MAX_SAMPLE_SLICES})) < {sample_slices}
      AND submission_timestamp BETWEEN '{submission_start}' AND '{submission_end}'
      -- Keep only pings whose build date is in the requested window. app_build
      -- starts with YYYYMMDD; compare those first 8 characters.
      AND SUBSTR(client_info.app_build, 1, 8) BETWEEN '{date_str}' AND '{end_date_str}'
    """


def _query_bigquery(sql, billing_project):
    """Run sql against BigQuery and return an iterator over the result rows.

    Selecting production-scale results back inline fails with "Response too
    large to return" (BigQuery's getQueryResults path is capped). So instead of
    selecting rows directly, we wrap the query in a CREATE OR REPLACE TABLE ...
    AS SELECT that writes the rows to a temp table, then read that table with
    list_rows (paginated tabledata.list) so memory stays bounded.

    Because the job is a CREATE TABLE statement, query_job.result() returns an
    empty result (the rows went to the table, not inline), so it is safe to
    block on and never hits the large-result limit.

    The table is created with OPTIONS(expiration_timestamp=...), so BigQuery
    reclaims it on schedule even if this process is killed right afterwards (and
    the mozdata.tmp dataset has a default expiration as a further backstop).

    google-cloud-bigquery is imported lazily and this whole function is the
    single BigQuery touchpoint, so the module imports without the package and
    unit tests can stub it.
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=billing_project)
    destination = (
        f"{_MATERIALIZATION_PROJECT}.{_MATERIALIZATION_DATASET}"
        f".bhr_aggregate_{uuid.uuid4().hex}"
    )
    create_table_sql = (
        f"CREATE OR REPLACE TABLE `{destination}`\n"
        f"OPTIONS (expiration_timestamp = TIMESTAMP_ADD("
        f"CURRENT_TIMESTAMP(), INTERVAL {_MATERIALIZATION_EXPIRY_HOURS} HOUR))\n"
        f"AS\n{sql}"
    )
    query_job = client.query(create_table_sql)
    print(f"BigQuery job {query_job.job_id} writing to {destination}", flush=True)
    query_job.result()  # Block until the table is built; empty result, raises on failure.
    return client.list_rows(destination)


def get_data(date, sample_size, billing_project, end_date=None, exclude_modules=False):
    """Stream BHR pings from BigQuery, filtered to the active build-date window.

    Args:
        date: datetime.date marking the start of the build-id window
        sample_size: float in [0, 1]; fraction of pings to read
        billing_project: GCP project to bill the BQ query against
        end_date: datetime.date for the end of the build-id window
            (default: same as date — a single-day window)
        exclude_modules: skip the hangs_modules column if True

    Yields:
        Dicts with slash/style keys (one per matching ping) — the same shape
        the rest of the aggregation pipeline expects.
    """
    if end_date is None:
        end_date = date

    sample_slices = compute_sample_slices(sample_size)
    sql = build_query_sql(date, end_date, sample_slices)
    properties = _properties_for(exclude_modules)

    # The build-date window is filtered in SQL (see build_query_sql), so every
    # row that comes back is already in-window. Here we only drop rows that are
    # missing a required field.
    total = 0
    kept = 0
    for row in _query_bigquery(sql, billing_project):
        total += 1
        if total % _PROGRESS_EVERY_ROWS == 0:
            print(f"  ...read {total:,} rows ({kept:,} kept)", flush=True)
        ping = get_ping_properties(row, properties)
        if not properties_are_not_none(ping, properties):
            continue
        kept += 1
        yield ping

    print(f"{total} results total", flush=True)
    print(f"{kept} results after field filter", flush=True)


def collect_offsets_by_module(hangs):
    """Group unique (module, offset) frames by module across a set of hangs.

    Each hang is expected to be a tuple whose first element is a list of
    (module, offset) frames as produced by process_frame. The returned
    dict has one entry per distinct module, mapping it to the set of
    distinct offsets seen for that module across all hangs.

    This is the input shape symbolication.symbolicate_modules() consumes:
    one symbol-server fetch per module, then bisect-resolve every offset
    against the parsed symbol map.

    Replaces the PySpark RDD pattern from the python_mozetl version:
        hangs.flatMap(...).map(...).distinct().reduceByKey(...)
    """
    by_module = {}
    for hang in hangs:
        for module, offset in hang[0]:
            by_module.setdefault(module, set()).add(offset)
    return by_module


def process_frame(frame, modules):
    """Turn one raw stack frame into a (module, offset) pair.

    Glean delivers frames as {"frame": offset, "module": index} dicts. A
    missing module index means a pseudo (label) frame; an out-of-range
    index means the module table didn't have an entry, so we keep the
    offset but drop the module. The list form and the bare-value fallback
    handle legacy/odd shapes the python_mozetl version also accepted.
    """
    # Glean format: {"frame": "...", "module": 0}
    if isinstance(frame, dict):
        module_index = frame.get("module")
        offset = frame.get("frame")

        if module_index is None:
            return (("pseudo", None), offset)

        if module_index < 0 or module_index >= len(modules):
            return (None, offset)

        debug_name, breakpad_id = modules[module_index]
        return ((debug_name, breakpad_id), offset)

    # Legacy telemetry format: [module_index, offset]
    if isinstance(frame, list):
        module_index, offset = frame
        if module_index is None or module_index < 0 or module_index >= len(modules):
            return (None, offset)
        debug_name, breakpad_id = modules[module_index]
        return ((debug_name, breakpad_id), offset)

    # Pseudo frame fallback.
    return (("pseudo", None), frame)


def filter_hang(hang, config):
    """Keep only hangs on the thread we care about with a sane stack length.

    Uses .get() rather than indexing because some Glean hang records arrive
    without a stack field (see the python_mozetl follow-up that fixed the
    crash on larger samples).
    """
    stack = hang.get("stack")
    return (
        hang.get("thread") == config["thread_filter"]
        and isinstance(stack, list)
        and len(stack) > 0
        and len(stack) < 300
    )


def process_hang(hang):
    """Normalise a hang record to a plain dict.

    BigQuery rows come back as Row objects with an asDict() method; plain
    dicts (used in tests) are returned unchanged.
    """
    if hasattr(hang, "asDict"):
        return hang.asDict(recursive=True)
    return hang


def process_hangs(ping, config):
    """Expand one ping into a list of per-hang tuples.

    Each returned tuple is:
        (stack, duration, thread, runnable_name, process, annotations,
         build_date, platform)
    where stack is a list of (module, offset) pairs from process_frame.
    """
    build_date = ping["client_info/app_build"][:8]  # "YYYYMMDD"
    platform = "{}".format(ping["client_info/os"])

    modules = ping["metrics/object/hangs_modules"]
    if isinstance(modules, str):
        modules = json.loads(modules)

    raw_hangs = ping["metrics/object/hangs_reports"]
    if isinstance(raw_hangs, str):
        raw_hangs = json.loads(raw_hangs)

    hangs = [process_hang(h) for h in raw_hangs]

    result = []
    for h in hangs:
        if not filter_hang(h, config):
            continue
        stack = [
            process_frame(frame, modules)
            for frame in h["stack"]
            if not isinstance(frame, list) or len(frame) == 2
        ]
        annotations = h.get("annotations") or []
        row = (
            stack,
            h["duration"],
            h["thread"],
            "",
            h["process"],
            annotations,
            build_date,
            platform,
        )
        result.append(row)

    return result


def symbolicate_stacks(stack, symbol_map):
    """Replace (module, offset) frames with (symbol, lib_name) frames.

    symbol_map is the dict returned by symbolication.symbolicate_modules,
    keyed by (module, offset). A frame with no module, no map entry, or a
    None symbol falls back to the UNSYMBOLICATED sentinel. Ported verbatim
    from python_mozetl, including the tuple() coercion on the lookup key
    and the processed[0] is not None guard.
    """
    symbolicated = []
    for module, offset in stack:
        if module is not None:
            debug_name = module[0]
            processed = symbol_map.get((tuple(module), offset), None)
            if processed is not None and processed[0] is not None:
                symbolicated.append(processed)
            else:
                symbolicated.append((UNSYMBOLICATED, debug_name))
        else:
            symbolicated.append((UNSYMBOLICATED, "unknown"))
    return symbolicated


def symbolicate_hang(hang, symbol_map):
    """Symbolicate a raw hang's stack and apply the signature heuristics.

    Takes a raw hang tuple (stack of (module, offset) frames, then the
    metadata fields) and returns the same tuple with its stack replaced by
    a symbolicated, heuristic-trimmed stack. Mirrors process_hang_key from
    python_mozetl.
    """
    stack = hang[0]
    symbolicated = symbolicate_stacks(stack, symbol_map)
    symbolicated = apply_hang_signature_heuristics(symbolicated)
    return (symbolicated,) + tuple(hang[1:])


def tupleize_annotation_list(annotations):
    """Sort annotations by key and freeze them into a hashable tuple.

    Annotations become part of the aggregation key, so they need a stable,
    hashable representation.
    """
    return tuple((k, v) for k, v in sorted(annotations, key=lambda x: x[0]))


def map_to_hang_data(hang, config):
    """Turn one symbolicated hang into a (key, (duration, count)) pair.

    The key bundles everything that makes two hangs "the same" for
    aggregation: the stack, runnable name, thread, build date, annotations,
    and platform. Hangs outside the configured duration bounds are dropped
    (returns an empty list so the caller can flat-map over it).
    """
    (
        stack,
        duration,
        thread,
        runnable_name,
        process,
        annotations,
        build_date,
        platform,
    ) = hang
    if duration < config["hang_lower_bound"]:
        return []
    if duration >= config["hang_upper_bound"]:
        return []

    key = (
        tuple((a, b) for a, b in stack),
        runnable_name,
        thread,
        build_date,
        tupleize_annotation_list(annotations),
        platform,
    )
    return [(key, (float(duration), 1.0))]


def merge_hang_data(a, b):
    """Sum the (duration, count) values of two hangs that share a key."""
    return (a[0] + b[0], a[1] + b[1])


def group_hangs(hangs, config):
    """Aggregate symbolicated hangs by key, summing duration and count.

    Replaces the python_mozetl Spark chain
    flatMap(map_to_hang_data).reduceByKey(merge_hang_data).collect().
    Returns a list of (key fields..., duration_sum, count_sum) tuples, the
    8-element shape ProfileProcessor.ingest consumes.
    """
    grouped = {}
    for hang in hangs:
        for key, value in map_to_hang_data(hang, config):
            if key in grouped:
                grouped[key] = merge_hang_data(grouped[key], value)
            else:
                grouped[key] = value
    return [(*key, *value) for key, value in grouped.items()]


def write_file(name, data, output_dir):
    """Write `data` as JSON to output_dir/<name>.json, creating the dir."""
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, name + ".json")
    with open(path, "w", encoding="utf8") as json_file:
        json.dump(data, json_file, ensure_ascii=False)
    return path


def aggregate(
    date,
    sample_size,
    billing_project,
    output_dir="output",
    output_tag="main",
    end_date=None,
    config_overrides=None,
):
    """Run the full BHR aggregation for one build-date window.

    Wires together the whole pipeline:
        get_data         -> stream pings from BigQuery
        process_hangs    -> expand each ping into hang tuples
        collect_offsets_by_module + symbolicate_modules -> symbol lookup table
        symbolicate_hang -> symbolicate + trim each hang's stack
        group_hangs      -> aggregate by signature
        ProfileProcessor -> build the columnar output
        write_file       -> hangs_<tag>_<date>.json and hangs_<tag>_current.json

    `date` is the build date to process. usageHoursByDate is set to a dummy
    1.0 because Glean doesn't provide usage hours in the legacy shape (the
    frontend only needs a non-null value here).

    Returns the profile dict that was written.
    """
    config = dict(DEFAULT_CONFIG)
    config["uuid"] = uuid.uuid4().hex
    if config_overrides:
        config.update(config_overrides)

    date_str = date.strftime("%Y%m%d")
    job_start = time.time()

    def _phase(message):
        print(f"[{int(time.time() - job_start):>4}s] {message}", flush=True)

    # Stream pings and expand each valid one into hang tuples. The pings
    # themselves are not retained; only the (much smaller) hang set is.
    _phase(f"Fetching pings from BigQuery for build date {date_str}...")
    hangs = []
    for ping in get_data(
        date,
        sample_size,
        billing_project,
        end_date=end_date,
        exclude_modules=config["exclude_modules"],
    ):
        if not ping_is_valid(ping):
            continue
        hangs.extend(process_hangs(ping, config))
    _phase(f"Collected {len(hangs)} hangs.")

    # Symbolicate: one symbol-server fetch per unique module, then resolve
    # every hang's stack and apply the signature heuristics.
    frames_by_module = collect_offsets_by_module(hangs)
    _phase(f"Symbolicating {len(frames_by_module)} unique modules...")
    symbol_map = symbolicate_modules(frames_by_module, config)
    _phase(f"Resolved {len(symbol_map)} (module, offset) frames.")
    symbolicated = [symbolicate_hang(hang, symbol_map) for hang in hangs]

    # Aggregate by signature and build the columnar profile.
    grouped = group_hangs(symbolicated, config)
    _phase(f"Aggregated into {len(grouped)} hang signatures.")
    _phase("Building profile...")
    processor = ProfileProcessor(config)
    processor.ingest(grouped, {date_str: 1.0})
    profile = processor.process_into_profile()

    base = "hangs_" + output_tag
    written = write_file(f"{base}_{date_str}", profile, output_dir)
    write_file(f"{base}_current", profile, output_dir)
    _phase(f"Wrote {written}")
    return profile
