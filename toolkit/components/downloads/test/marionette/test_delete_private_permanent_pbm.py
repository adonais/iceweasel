# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import shutil
import tempfile

from marionette_harness import MarionetteTestCase

AUTOSTART_PBM_PREF = "browser.privatebrowsing.autostart"
DELETE_PRIVATE_PREF = "browser.download.deletePrivate"


class DeletePrivateDownloadsInPermanentPBM(MarionetteTestCase):
    """
    In permanent private browsing mode "last-pb-context-exited" is never
    notified, so private downloads must be deleted at shutdown when
    browser.download.deletePrivate is set.
    """

    def setUp(self):
        super().setUp()

        self.marionette.set_pref(AUTOSTART_PBM_PREF, True)
        self.marionette.set_pref(DELETE_PRIVATE_PREF, True)
        # Avoid the remote download reputation check.
        self.marionette.set_pref("browser.safebrowsing.downloads.remote.enabled", False)
        self.marionette.restart(in_app=True)

        self.target_dir = tempfile.mkdtemp()
        self.target_path = os.path.join(self.target_dir, "download.html")

    def tearDown(self):
        self.marionette.restart(in_app=False, clean=True)
        shutil.rmtree(self.target_dir, ignore_errors=True)
        super().tearDown()

    def test_private_download_deleted_on_shutdown(self):
        with self.marionette.using_context("chrome"):
            self.assertTrue(
                self.marionette.execute_script(
                    """
                    const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
                      "resource://gre/modules/PrivateBrowsingUtils.sys.mjs"
                    );
                    return PrivateBrowsingUtils.permanentPrivateBrowsing;
                    """
                ),
                "Permanent private browsing mode is enabled",
            )

            error = self.marionette.execute_async_script(
                """
                const [url, targetPath, resolve] = arguments;
                const { Downloads } = ChromeUtils.importESModule(
                  "resource://gre/modules/Downloads.sys.mjs"
                );
                (async () => {
                  const download = await Downloads.createDownload({
                    source: { url, isPrivate: true },
                    target: targetPath,
                  });
                  const list = await Downloads.getList(Downloads.PRIVATE);
                  await list.add(download);
                  await download.start();
                })().then(() => resolve(null), e => resolve(String(e)));
                """,
                script_args=(
                    self.marionette.absolute_url("empty.html"),
                    self.target_path,
                ),
            )
            self.assertIsNone(error, "Private download succeeded")

        self.assertTrue(
            os.path.exists(self.target_path), "Private download was completed"
        )

        self.marionette.quit(in_app=True)
        self.assertFalse(
            os.path.exists(self.target_path),
            "Private download was deleted on shutdown",
        )

        self.marionette.start_session()
