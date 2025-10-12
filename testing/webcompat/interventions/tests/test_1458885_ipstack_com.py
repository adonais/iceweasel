import pytest

URL = "https://ipstack.com/"

BUTTON_CSS = "label[for=ipcheck_submit]"


async def is_button_text_on_one_line(client):
    await client.navigate(URL)
    return client.execute_script(
        """
        return arguments[0].getBoxQuads().length == 1;
      """,
        client.await_css(BUTTON_CSS, is_displayed=True),
    )


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await is_button_text_on_one_line(client)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await is_button_text_on_one_line(client)
