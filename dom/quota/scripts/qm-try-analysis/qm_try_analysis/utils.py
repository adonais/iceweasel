# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import datetime
import json

import requests
from mozfile import json as mozfile_json

from qm_try_analysis.logging import error, info, warning


def readJSONFile(FileName):
    f = open(FileName)
    p = mozfile_json.load(f)
    f.close()
    return p


def writeJSONFile(FileName, Content):
    with open(FileName, "w") as outfile:
        json.dump(Content, outfile, indent=4)


def dateback(days):
    today = datetime.date.today()
    delta = datetime.timedelta(days)
    return today - delta


def lastweek():
    today = datetime.date.today()
    delta = datetime.timedelta(days=7)
    return today - delta


# Given a set of build ids, fetch the repository base URL for each id.
# Returns the git commit for each id, where hg.mozilla.org knows it.
def fetchBuildRevisions(buildids):
    buildhub_url = "https://buildhub.moz.tools/api/search"
    delids = {}
    gitcommits = {}
    for bid in buildids:
        info(f"Fetching revision for build {bid}.")
        body = {"size": 1, "query": {"term": {"build.id": bid}}}
        resp = requests.post(url=buildhub_url, json=body)
        hits = resp.json()["hits"]["hits"]
        if len(hits) > 0:
            source = hits[0]["_source"]["source"]
            buildids[bid] = source["repository"] + "/annotate/" + source["revision"]
            gitcommits[bid] = fetchGitCommit(source["repository"], source["revision"])
        else:
            warning(f"No revision for build.id {bid}")
            delids[bid] = "x"
    for bid in delids:
        buildids.pop(bid)
    return gitcommits


# hg.mozilla.org mirrors the git repository and records the git commit of
# each changeset, which Searchfox permalinks need.
def fetchGitCommit(repository, revision):
    resp = requests.get(url=f"{repository}/json-rev/{revision}")
    if resp.ok:
        return resp.json().get("git_commit")
    warning(f"No changeset information for {revision}")
    return None


def readExecutionFile(workdir):
    exefile = f"{workdir}/qmexecutions.json"
    try:
        return readJSONFile(exefile)
    except OSError:
        return []


def writeExecutionFile(workdir, executions):
    exefile = f"{workdir}/qmexecutions.json"
    try:
        writeJSONFile(exefile, executions)
    except OSError:
        error("Error writing execution record.")


def getLastRunFromExecutionFile(workdir):
    executions = readExecutionFile(workdir)
    if len(executions) > 0:
        return executions[len(executions) - 1]
    return {}


def updateLastRunToExecutionFile(workdir, run):
    executions = readExecutionFile(workdir)
    executions[len(executions) - 1] = run
    writeExecutionFile(workdir, executions)


def addNewRunToExecutionFile(workdir, run):
    executions = readExecutionFile(workdir)
    executions.append(run)
    writeExecutionFile(workdir, executions)
