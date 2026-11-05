import pytest

URL = "https://bam.barrister.com/techportal/"
GOOD_MSG = "Initializing Firebase firebase_messaging"
ERROR_MSG = "Another exception was thrown: Instance of 'minified:ng<void>'"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="load", await_console_message=GOOD_MSG)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="load", await_console_message=ERROR_MSG)
