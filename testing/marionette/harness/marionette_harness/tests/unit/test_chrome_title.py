# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys

from marionette_harness import MarionetteTestCase, parameterized, WindowManagerMixin

# add this directory to the path
sys.path.append(os.path.dirname(__file__))

from chrome_handler_mixin import ChromeHandlerMixin


PAGE_XHTML = "test.xhtml"
PAGE_XUL = "test_xul.xhtml"


class TestTitleChrome(ChromeHandlerMixin, WindowManagerMixin, MarionetteTestCase):
    def tearDown(self):
        try:
            self.close_all_windows()
        finally:
            super(TestTitleChrome, self).tearDown()

    @parameterized("XUL", PAGE_XUL)
    @parameterized("XHTML", PAGE_XHTML)
    def test_get_title(self, chrome_url):
        win = self.open_chrome_window(self.chrome_base_url + chrome_url)
        self.marionette.switch_to_window(win)

        with self.marionette.using_context("chrome"):
            expected_title = self.marionette.execute_script(
                "return window.document.title;"
            )
            self.assertEqual(self.marionette.title, expected_title)
