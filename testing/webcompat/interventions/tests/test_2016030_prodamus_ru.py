import pytest

URL = "https://prodamus.ru/pravila-provedeniya-akcii-fevral-vozmozhnostej"

FRAME_CSS = "iframe[src*=pdf]"


async def is_pdf_full_height(client):
    await client.navigate(URL, wait="none", timeout=120)
    return client.execute_script(
        """
        return arguments[0].getBoundingClientRect().height >= window.innerHeight;
    """,
        client.await_css(FRAME_CSS, timeout=60),
    )


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await is_pdf_full_height(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await is_pdf_full_height(client)
