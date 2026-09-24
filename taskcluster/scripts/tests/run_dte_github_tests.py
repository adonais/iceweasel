import asyncio
import functools
import io
import json
import os
import sys
import time
import zipfile

import requests
from urllib3.util.retry import Retry

GITHUB_API = "https://api.github.com"
GITHUB_REPO = "mozilla/fx-desktop-qa-automation"
POLL_INTERVAL = 60
POLL_TIMEOUT = int(os.environ.get("POLL_TIMEOUT", "3600"))


@functools.lru_cache
def get_session():
    """A requests Session that retries on transient server errors."""
    session = requests.Session()
    retry = Retry(total=5, backoff_factor=0.1, status_forcelist=[500, 502, 503, 504])
    http_adapter = requests.adapters.HTTPAdapter(max_retries=retry)
    session.mount("https://", http_adapter)
    session.mount("http://", http_adapter)
    return session


@functools.lru_cache
def get_tc_secret(secret_name="gha-pat", level=3, level_flag=False):
    """Returns the Taskcluster secret.

    Returns False when not running on tc
    """
    if not os.environ.get("MOZ_AUTOMATION"):
        return False
    tc_home = os.environ.get("TASKCLUSTER_PROXY_URL", "http://taskcluster")
    level = os.environ.get("MOZ_SCM_LEVEL", level)
    level_text = f"level-{level}/" if level_flag else ""
    secrets_url = f"{tc_home}/secrets/v1/secret/project/desktop-test-ops/{level_text}{secret_name}"

    res = get_session().get(secrets_url, timeout=30)
    res.raise_for_status()

    return res.json()["secret"]


async def poller(url, condition={"status": "completed"}):
    """
    Poll the GHA endpoint until the run reaches the given condition.
    """
    deadline = time.monotonic() + POLL_TIMEOUT
    while True:
        resp = get_session().get(url=url, headers=build_headers(), timeout=30)
        resp.raise_for_status()
        payload = resp.json()
        if payload == payload | condition:
            print(f"Condition reached: {condition}")
            return payload
        if time.monotonic() > deadline:
            raise TimeoutError(
                f"Run did not reach {condition} within {POLL_TIMEOUT}s. "
                f"See {payload.get('html_url', url)}"
            )
        await asyncio.sleep(POLL_INTERVAL)


def build_headers():
    """Build headers for the GHA API calls"""
    secret = get_tc_secret()
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {secret['ghaToken'] if secret else os.environ['GHA_PAT']}",
        "X-GitHub-Api-Version": "2026-03-10",
    }


def issue_api_call():
    """Call POST on the GHA workflow dispatch endpoint with necessary info"""
    target_url = os.environ["INSTALLER_LINK"]
    workflow_id = os.environ["WORKFLOW_ID"]
    input_key = os.environ["INPUT_KEY"]
    branch = os.environ["BRANCH"]
    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/actions/workflows/{workflow_id}/dispatches"
    data = {"ref": branch, "inputs": {input_key: target_url}}
    if os.environ.get("TEST_SET"):
        data["inputs"]["test_set"] = os.environ.get("TEST_SET")
    resp = get_session().post(url=url, headers=build_headers(), json=data, timeout=30)
    print(url, data)
    print(resp.status_code, resp.reason)
    resp.raise_for_status()
    print(resp.json().get("run_url"))
    return resp.json()


def download_artifacts(run_id, dest):
    """Unpack every artifact published by the GHA run into dest."""
    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/actions/runs/{run_id}/artifacts"
    resp = get_session().get(url=url, headers=build_headers(), timeout=30)
    resp.raise_for_status()
    artifacts = [a for a in resp.json().get("artifacts", []) if not a.get("expired")]

    if not artifacts:
        print(f"WARNING: run {run_id} published no artifacts")

    for artifact in artifacts:
        archive = get_session().get(
            url=artifact["archive_download_url"], headers=build_headers(), timeout=300
        )
        archive.raise_for_status()
        target = os.path.join(dest, artifact["name"])
        with zipfile.ZipFile(io.BytesIO(archive.content)) as zip_file:
            zip_file.extractall(target)
        print(f"Extracted {artifact['name']} to {target}")

    return artifacts


def print_test_summaries(dest):
    """Surface the pytest totals from the reports we pulled back."""
    for root, _, filenames in os.walk(dest):
        for filename in sorted(filenames):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(root, filename)
            try:
                with open(path) as report:
                    summary = json.load(report).get("summary")
            except (OSError, ValueError):
                continue
            if summary:
                print(f"{os.path.relpath(path, dest)}: {summary}")


def main():
    post_response = issue_api_call()
    run = asyncio.run(poller(post_response["run_url"]))

    conclusion = run.get("conclusion")
    print(f"Run {run['id']} concluded: {conclusion}. See {run.get('html_url')}")

    # Fetch the reports before acting on the conclusion, so a failing run still
    # leaves its artifacts behind for debugging.
    upload_dir = os.environ.get("UPLOAD_DIR", "artifacts")
    os.makedirs(upload_dir, exist_ok=True)
    download_artifacts(run["id"], upload_dir)
    print_test_summaries(upload_dir)

    return 0 if conclusion == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
