import pytest

URL = "https://onlyfaucet.com/"
BLOCKED_TEXT = "you have been blocked"
UNBLOCKED_CSS = "[data-target='#login']"


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL)
    assert client.await_css(UNBLOCKED_CSS, is_displayed=True)
    assert not client.find_text(BLOCKED_TEXT, is_displayed=True)
