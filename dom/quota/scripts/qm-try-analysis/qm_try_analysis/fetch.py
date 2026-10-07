#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import pathlib

import click

from qm_try_analysis import telemetry, utils
from qm_try_analysis.logging import info

"""
The analysis is based on the following query:
https://sql.telemetry.mozilla.org/queries/126505/source?p_year=2026&p_month=09&p_day=09&p_build=20260901000000&p_last=0

SELECT UNIX_MILLIS(submission_timestamp) AS submit_timeabs,
       client_info.app_build AS build_id,
       COALESCE(legacy_telemetry_client_id, client_id) AS client_id,
       COALESCE(JSON_VALUE(metrics, '$.uuid.legacy_telemetry_session_id'), document_id) AS session_id,
       UNIX_MILLIS(event_timestamp) AS event_timestamp,
       CAST(JSON_VALUE(event_extra, '$.seq') AS INT64) AS seq,
       JSON_VALUE(event_extra, '$.context') AS context,
       JSON_VALUE(event_extra, '$.source_file') AS source_file,
       JSON_VALUE(event_extra, '$.source_line') AS source_line,
       JSON_VALUE(event_extra, '$.severity') AS severity,
       JSON_VALUE(event_extra, '$.result') AS result
FROM firefox_desktop.events_stream
WHERE DATE(submission_timestamp) >= CAST('{{ year }}-{{ month }}-{{ day }}' AS DATE)
  AND normalized_channel = 'nightly'
  AND event_category = 'dom.quota.try'
  AND event_name = 'error_step'
  AND client_info.app_build >= '{{ build }}'
  AND UNIX_MILLIS(submission_timestamp) > {{ last }}
ORDER BY submit_timeabs
LIMIT 600000

We fetch events in chronological order, as we want to keep track of where we already
arrived with our analysis. To accomplish this we write our runs into qmexecutions.json.

[
    {
        "workdir": ".",
        "daysback": 1,
        "numrows": 17377,
        "lasteventtime": 1617303855145,
        "rawfile": "./qmrows_until_1617303855145.json"
    }
]

lasteventtime is the highest value of submit_timeabs we found in our data.

analyze_qm_failures instead needs the rows to be ordered by
client_id, session_id, thread_id, submit_timeabs, seq
Thus we sort the rows accordingly before writing them.
"""

QUERY_ID = 126505


@click.command()
@click.option(
    "-k",
    "--key",
    required=True,
    help="Your personal telemetry API key.",
)
@click.option(
    "-b",
    "--minbuild",
    default="20210329000000",
    help="The lowest build id we will fetch data for. This should have the following format: `yyyymmddhhmmss`.",
)
@click.option("-d", "--days", type=int, default=7, help="Number of days to go back.")
@click.option(
    "-l",
    "--lasteventtime",
    type=int,
    default=0,
    help="Fetch only events after this number of Unix milliseconds.",
)
@click.option(
    "-w",
    "--workdir",
    type=click.Path(file_okay=False, writable=True, path_type=pathlib.Path),
    default="output",
    help="Working directory",
)
def fetch_qm_failures(key, minbuild, days, lasteventtime, workdir):
    """
    Invokes the Redash query QUERY_ID and stores the result in a JSON file.
    """
    # Creeate output dir if it does not exist
    workdir.mkdir(exist_ok=True)

    start = utils.dateback(days)
    year, month, day = start.year, start.month, start.day

    run = {}
    lastrun = utils.getLastRunFromExecutionFile(workdir)
    if "lasteventtime" in lastrun:
        lasteventtime = lastrun["lasteventtime"]

    run["workdir"] = workdir.as_posix()
    run["daysback"] = days
    run["minbuild"] = minbuild

    p_params = f"p_year={year:04d}&p_month={month:02d}&p_day={day:02d}&p_build={minbuild}&p_last={lasteventtime}"

    # See the module docstring for more information on the query
    result = telemetry.query(key, QUERY_ID, p_params)
    rows = result["query_result"]["data"]["rows"]
    run["numrows"] = len(rows)

    if run["numrows"] > 0:
        lasteventtime = telemetry.getLastEventTimeAbs(rows)
        run["lasteventtime"] = lasteventtime
        rows.sort(
            key=lambda row: "{}.{}.{}.{}.{:06d}".format(
                row["client_id"],
                row["session_id"],
                row["seq"] >> 32,  # thread_id
                row["submit_timeabs"],
                row["seq"] & 0x00000000FFFFFFFF,  # seq,
            ),
            reverse=False,
        )
        outfile = f"{workdir}/qmrows_until_{lasteventtime}.json"
        utils.writeJSONFile(outfile, rows)
        run["rawfile"] = outfile
    else:
        info("No results found, maybe next time.")
        run["lasteventtime"] = lasteventtime

    utils.addNewRunToExecutionFile(workdir, run)


if __name__ == "__main__":
    fetch_qm_failures()
