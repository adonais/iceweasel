import os


here = os.path.abspath(os.path.dirname(__file__))


class ChromeHandlerMixin(object):
    def setUp(self):
        super(ChromeHandlerMixin, self).setUp()

        entries = [["content", "marionette-chrome", "chrome/"]]

        self.handler_id = self.marionette.register_chrome_handler(
            os.path.join(here, "assets", "chrome.manifest"), entries
        )

    def tearDown(self):
        if self.handler_id:
            try:
                self.marionette.unregister_chrome_handler(self.handler_id)
            except:
                # if the session was deleted the chrome handler is no longer known
                pass

        super(ChromeHandlerMixin, self).tearDown()

    @property
    def chrome_base_url(self):
        return "chrome://marionette-chrome/content/"
