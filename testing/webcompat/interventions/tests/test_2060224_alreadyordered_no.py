import pytest

URL = "https://www.alreadyordered.no/compass149002/content/uncode-lite_child/mobile_view.php"
IFRAME_CSS = ".content > iframe"
UNSUPPORTED_ALERT = "This browser is not supported"


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    client.switch_to_frame(client.await_css(IFRAME_CSS))
    assert not await client.find_alert(delay=3)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    client.switch_to_frame(client.await_css(IFRAME_CSS))
    assert await client.await_alert(UNSUPPORTED_ALERT)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_android_enabled(client):
    await client.navigate(URL)
    assert not await client.find_alert(delay=3)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_android_disabled(client):
    await client.navigate(URL)
    assert await client.await_alert(UNSUPPORTED_ALERT)
