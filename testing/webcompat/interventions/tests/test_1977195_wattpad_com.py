import pytest

URL = "https://www.wattpad.com/1091151997-the-mob-character-shouldn%27t-have-a-yandere-harem-1"
GOOD_CSS = "span.fa.fa-comment-count"
BROKEN_CSS = "img.fa.fa-comment-count.fallback"


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(GOOD_CSS, is_displayed=True)
    assert not client.find_css(BROKEN_CSS, is_displayed=True)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(BROKEN_CSS, is_displayed=True)
    assert not client.find_css(GOOD_CSS, is_displayed=True)
