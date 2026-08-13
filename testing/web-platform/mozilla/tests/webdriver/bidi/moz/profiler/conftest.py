import pytest_asyncio

from bidi.support.moz import Moz


@pytest_asyncio.fixture(autouse=True)
async def setup_moz_bidi(bidi_session):
    bidi_session.moz = Moz(bidi_session)
    yield


@pytest_asyncio.fixture(autouse=True)
async def stop_profiler_after_test(bidi_session):
    """Ensure the profiler is stopped after each test, even if it failed."""
    yield

    try:
        await bidi_session.moz.profiler.stop(discard=True)
    except Exception as e:
        print(f"Failed to stop profiler after test: {e}")


@pytest_asyncio.fixture
async def is_profiler_active(bidi_session):
    async def _is_profiler_active():
        status = await bidi_session.moz.profiler.is_active()
        return status["active"]

    return _is_profiler_active
