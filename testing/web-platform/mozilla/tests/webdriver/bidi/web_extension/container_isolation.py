import pytest
from webdriver.bidi.error import UnsupportedOperationException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_install(bidi_session, extension_data):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.web_extension.install(
            extension_data={
                "type": "base64",
                "value": extension_data["base64"],
            }
        )
