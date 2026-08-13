import pytest
from webdriver.bidi import error
from webdriver.bidi.modules.storage import BrowsingContextPartitionDescriptor

pytestmark = pytest.mark.asyncio


@pytest.mark.geckodriver(allow_system_access=True)
async def test_chrome_browsing_context_not_supported(bidi_session, chrome_context):
    # Retrieve the chrome browsing context for the open browser window
    assert chrome_context["moz:scope"] == "chrome"

    partition = BrowsingContextPartitionDescriptor(chrome_context["context"])
    with pytest.raises(error.UnsupportedOperationException):
        await bidi_session.storage.get_cookies(partition=partition)
