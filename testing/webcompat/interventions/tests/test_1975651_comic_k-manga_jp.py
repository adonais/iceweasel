import pytest

URL = "https://comic.k-manga.jp/"
FIRST_BOOK_CSS = "[data-bookid] a[href*=title]"
READ_FREE_CSS = "[class*=book-info] a[href*=viewer-launcher]"
SUPPORTED_CSS = ".nv-pvImageCanvas"
UNSUPPORTED_TEXT = "お使いのブラウザでは閲覧できません"

OUTDATED_LINK_URL = "https://comic.k-manga.jp/viewer/sp/viewer.html?p0=BGTK_7e2f84c12e3fc8693054e926112aaaf1_202507041517&p1=9a027f2bcdae4b9c9505ede256522118&p2=2&p3=186044&p4=1&p5=eyJ1c2VySWQiOiJmYTU4ZWUzNDNjZjA1M2U0MGVlYWU5MGIyODE4NTA4ZiIsInVzZXJTdGF0dXMiOjAsImJvb2tJZCI6MTg2MDQ0LCJjaGFwdGVySWQiOjEsImZvcm1hdFR5cGUiOjEsInF1YWxpdHkiOiIxIiwiY29udGVudFR5cGUiOjIsImxpbWl0Q29udHJvbCI6ZmFsc2UsImJvb2tMaXN0S2V5IjpudWxsfQ%3D%3D&p8=7139fkjhl3d3k0m5t406ivvvva&p9=eyJ1c2VySWQiOiJmYTU4ZWUzNDNjZjA1M2U0MGVlYWU5MGIyODE4NTA4ZiIsInVzZXJTdGF0dXMiOjAsImJvb2tJZCI6MTg2MDQ0LCJjaGFwdGVySWQiOiJuIiwiZm9ybWF0VHlwZSI6MSwicXVhbGl0eSI6IjEiLCJjb250ZW50VHlwZSI6MiwibGltaXRDb250cm9sIjpmYWxzZSwiYm9va0xpc3RLZXkiOm51bGx9&p10=2&p15=0&p16=0&p19=0&p20=4839c607-ca9c-4c6b-b793-64d0eaa65440&p21=0&p23=0"
DEAD_LINK_TEXT = "前のページに戻り、再読み込み後、もう一度お試しください。"


async def visit_manga_page(client):
    await client.navigate(URL, wait="none")
    await client.navigate(
        client.get_element_attribute(client.await_css(FIRST_BOOK_CSS), "href"),
        wait="none",
    )
    await client.navigate(
        client.get_element_attribute(client.await_css(READ_FREE_CSS), "href"),
        wait="none",
    )


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled_dead_link(client):
    await client.navigate(OUTDATED_LINK_URL, wait="none")
    assert client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(DEAD_LINK_TEXT, is_displayed=True)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await visit_manga_page(client)
    assert client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
    assert not client.find_css(SUPPORTED_CSS, is_displayed=True)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled_dead_link(client):
    await client.navigate(OUTDATED_LINK_URL, wait="none")
    assert client.await_text(DEAD_LINK_TEXT, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await visit_manga_page(client)
    assert client.await_css(SUPPORTED_CSS, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)
