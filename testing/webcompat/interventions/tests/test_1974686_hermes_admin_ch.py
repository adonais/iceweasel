import pytest

URL = "https://www.hermes.admin.ch/de/projektmanagement/szenarien/it-entwicklung/szenariouebersicht.html"


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    client.await_text("404", is_displayed=True)
