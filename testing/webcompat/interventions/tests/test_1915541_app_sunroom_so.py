import pytest

URL = "https://app.sunroom.so/"

SUPPORTED_CSS = "button[data-testid='action-button']"
DRM_UNSUPPORTED_TEXT = "only supports devices with Widevine L1"
UNSUPPORTED_TEXT = "browser not supported"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    drm, supported = client.await_first_element_of(
        [
            client.css(SUPPORTED_CSS),
            client.text(DRM_UNSUPPORTED_TEXT),
        ],
        is_displayed=True,
    )
    assert drm or supported
    assert not client.find_text(UNSUPPORTED_TEXT)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    assert client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
    assert not client.find_css(SUPPORTED_CSS)
