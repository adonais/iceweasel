import pytest

URL = "https://seller.kuajingmaihuo.com"
UNSUPPORTED_TEXT = "请使用 Chrome 浏览器打开"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    assert client.find_text(UNSUPPORTED_TEXT, is_displayed=True)
