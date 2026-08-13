import pytest
from webdriver.bidi import error

from .. import DEFAULT_START_OPTIONS

pytestmark = pytest.mark.asyncio


async def test_start_basic(bidi_session, is_profiler_active):
    assert await is_profiler_active() is False

    await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)

    assert await is_profiler_active() is True


@pytest.mark.parametrize("preset", ["web-developer", "firefox-platform"])
async def test_start_with_preset(bidi_session, is_profiler_active, preset):
    assert await is_profiler_active() is False

    await bidi_session.moz.profiler.start(preset=preset)

    assert await is_profiler_active() is True


async def test_start_with_preset_and_active_context(
    bidi_session, new_tab, is_profiler_active
):
    await bidi_session.moz.profiler.start(
        preset="web-developer", active_context=new_tab["context"]
    )

    assert await is_profiler_active() is True


async def test_start_with_multiple_features(bidi_session, is_profiler_active):
    options = {**DEFAULT_START_OPTIONS, "features": ["js", "stackwalk"]}
    await bidi_session.moz.profiler.start(**options)

    assert await is_profiler_active() is True


async def test_start_with_multiple_threads(bidi_session, is_profiler_active):
    options = {
        **DEFAULT_START_OPTIONS,
        "threads": ["GeckoMain", "Renderer", "DOM Worker"],
    }
    await bidi_session.moz.profiler.start(**options)

    assert await is_profiler_active() is True


async def test_start_with_active_context(bidi_session, new_tab, is_profiler_active):
    options = {**DEFAULT_START_OPTIONS, "active_context": new_tab["context"]}
    await bidi_session.moz.profiler.start(**options)

    assert await is_profiler_active() is True


async def test_start_while_already_running(bidi_session, is_profiler_active):
    await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)
    assert await is_profiler_active() is True

    with pytest.raises(error.UnsupportedOperationException):
        await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)

    assert await is_profiler_active() is True
