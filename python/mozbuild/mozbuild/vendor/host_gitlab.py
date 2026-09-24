# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

from urllib.parse import quote

from mozbuild.vendor.host_base import BaseHost


class GitLabHost(BaseHost):
    def _project_api_url(self):
        project = quote(self.repo_url.path.strip("/"), safe="")
        origin = f"{self.repo_url.scheme}://{self.repo_url.netloc}"
        return f"{origin}/api/v4/projects/{project}"

    def upstream_commit(self, revision):
        """Query the gitlab api for a git commit id and timestamp."""
        sha = quote(revision, safe="")
        req = self.session.get(f"{self._project_api_url()}/repository/commits/{sha}")
        req.raise_for_status()
        info = req.json()
        return (info["id"], info["committed_date"])

    def upstream_snapshot(self, revision):
        sha = quote(revision, safe="")
        return f"{self._project_api_url()}/repository/archive.tar.gz?sha={sha}"
