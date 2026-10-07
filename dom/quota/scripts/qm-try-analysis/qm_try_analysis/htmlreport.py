#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import sys
from datetime import datetime, timezone
from html import escape
from os import path

import click

from qm_try_analysis import stackanalysis, utils
from qm_try_analysis.logging import error, info

STYLE = """
body { font-family: sans-serif; margin: 2em; }
table { border-collapse: collapse; margin-bottom: 1.5em; }
th, td { border: 1px solid #ccc; padding: 0.3em 0.6em; vertical-align: top; }
th { background: #eee; text-align: left; }
td.num { text-align: right; white-space: nowrap; }
td.stack { font-family: monospace; word-break: break-all; }
th.sortable { cursor: pointer; }
th.sortable::after { content: " \\2195"; color: #999; }
th.sortable.asc::after { content: " \\2191"; color: inherit; }
th.sortable.desc::after { content: " \\2193"; color: inherit; }
"""

SCRIPT = """
document.addEventListener("click", function (event) {
  const th = event.target.closest("th.sortable");
  if (!th) {
    return;
  }
  const table = th.closest("table");
  const col = th.cellIndex;
  const desc = !th.classList.contains("desc");
  for (const header of table.querySelectorAll("th.sortable")) {
    header.classList.remove("asc", "desc");
  }
  th.classList.add(desc ? "desc" : "asc");
  const rows = Array.from(table.querySelectorAll("tr")).slice(1);
  rows.sort(function (a, b) {
    const x = a.cells[col].textContent;
    const y = b.cells[col].textContent;
    const diff = isNaN(x) || isNaN(y) ? x.localeCompare(y) : x - y;
    return desc ? -diff : diff;
  });
  for (const row of rows) {
    table.appendChild(row);
  }
});
"""

PAGE_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{style}</style>
<script>{script}</script>
</head>
<body>
<h1>{title}</h1>
<p>{numrows} rows, builds from {minbuild}, {errors} error stacks, {warnings} warning stacks.</p>
{sections}</body>
</html>
"""

SECTION_TEMPLATE = """<h2>{title}</h2>
{tables}"""

ANCHOR_TEMPLATE = """<h3>{anchor}</h3>
{table}"""

TABLE_TEMPLATE = """<table>
<tr>{headers}</tr>
{rows}
</table>
"""

HEADER_TEMPLATE = "<th{sortable}>{name}</th>"

ROW_TEMPLATE = """<tr><td class="num">{clients}</td><td class="num">{sessions}</td><td class="num">{hits}</td><td class="num">{build}</td><td>{anchor}</td><td class="stack">{frames}</td></tr>
"""

LINK_TEMPLATE = '<a href="{url}">{label}</a>'

COLUMNS = ["Clients", "Sessions", "Hits", "Build", "Anchor (Context)", "Stack"]
SORTABLE_COLUMNS = {"Clients", "Sessions", "Hits", "Build"}


def renderLink(url, label):
    return LINK_TEMPLATE.format(url=escape(url, quote=True), label=label)


def renderFrame(frame):
    label = escape(
        "{}#{}:{}".format(frame["source_file"], frame["source_line"], frame["result"])
    )
    url = frame.get("searchfox") or frame["location"]
    if not url.startswith("http"):
        return label
    return renderLink(url, label)


# The build id links to the changeset the build was made from, taken from
# the hg annotate URL of the first frame when Buildhub knew the build.
def renderBuild(stack):
    build = escape(str(stack.get("build_id", "")))
    location = stack["frames"][0]["location"]
    if "/annotate/" not in location:
        return build
    repository, rev = location.split("/annotate/", 1)
    return renderLink(f"{repository}/rev/{rev.split('/', 1)[0]}", build)


def renderHeader(column):
    sortable = ' class="sortable"' if column in SORTABLE_COLUMNS else ""
    return HEADER_TEMPLATE.format(sortable=sortable, name=column)


def renderStack(stack):
    anchor = "{} ({})".format(stack["frames"][0]["anchor"], stack["context"])
    return ROW_TEMPLATE.format(
        clients=stack["client_count"],
        sessions=stack["session_count"],
        hits=stack["hit_count"],
        build=renderBuild(stack),
        anchor=escape(anchor),
        frames=" <br> ".join(renderFrame(frame) for frame in stack["frames"]),
    )


def renderStacks(stacks):
    return TABLE_TEMPLATE.format(
        headers="".join(renderHeader(column) for column in COLUMNS),
        rows="".join(renderStack(stack) for stack in stacks),
    )


def renderAnchors(anchors):
    return "".join(
        ANCHOR_TEMPLATE.format(
            anchor=escape(anchor["anchor"]), table=renderStacks(anchor["stacks"])
        )
        for anchor in anchors.values()
    )


@click.command()
@click.option(
    "--output-to",
    type=click.Path(dir_okay=False, writable=True),
    default="qmstacks_until_<lasteventtime>.html",
    help="Specify the output file for the HTML report.",
)
@click.option(
    "-w",
    "--workdir",
    type=click.Path(file_okay=False, exists=True, writable=True),
    default="output",
    help="Working directory",
)
def html_qm_failures(output_to, workdir):
    """
    Renders the results of the previous analyze run as an HTML file with the
    same sections and columns as the text report.
    """
    run = utils.getLastRunFromExecutionFile(workdir)
    if not {"errorfile", "warnfile", "infofile", "abortfile"} <= run.keys():
        error("No analyzable execution from the previous run of analyze found.")
        sys.exit(2)

    if output_to == "qmstacks_until_<lasteventtime>.html":
        output_to = path.join(workdir, f"qmstacks_until_{run['lasteventtime']}.html")

    error_stacks = utils.readJSONFile(run["errorfile"])
    warn_stacks = utils.readJSONFile(run["warnfile"])
    info_stacks = utils.readJSONFile(run["infofile"])
    abort_stacks = utils.readJSONFile(run["abortfile"])
    anchors = stackanalysis.groupStacksForAnchors(error_stacks)

    until = datetime.fromtimestamp(run["lasteventtime"] / 1000, timezone.utc)
    title = f"QM_TRY failures until {until:%Y-%m-%d %H:%M} UTC"

    sections = [
        ("Error stacks", renderStacks(error_stacks)),
        ("Error stacks grouped by anchors", renderAnchors(anchors)),
        ("Warning stacks", renderStacks(warn_stacks)),
        ("Info stacks", renderStacks(info_stacks)),
        ("Aborted stacks", renderStacks(abort_stacks)),
    ]
    page = PAGE_TEMPLATE.format(
        title=escape(title),
        style=STYLE,
        script=SCRIPT,
        numrows=run.get("numrows", "?"),
        minbuild=escape(str(run.get("minbuild", "?"))),
        errors=len(error_stacks),
        warnings=len(warn_stacks),
        sections="".join(
            SECTION_TEMPLATE.format(title=name, tables=tables)
            for name, tables in sections
        ),
    )

    with open(output_to, "w") as output:
        output.write(page)

    run["htmlfile"] = output_to
    utils.updateLastRunToExecutionFile(workdir, run)
    info(f"Wrote HTML report to {output_to}")


if __name__ == "__main__":
    html_qm_failures()
