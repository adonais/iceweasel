import json
import os

import pytest

from .. import DEFAULT_START_OPTIONS

pytestmark = pytest.mark.asyncio


async def test_stop_basic(bidi_session, is_profiler_active):
    await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)
    assert await is_profiler_active() is True

    await bidi_session.moz.profiler.stop(discard=True)
    assert await is_profiler_active() is False


async def test_stop_when_not_running(bidi_session, is_profiler_active):
    assert await is_profiler_active() is False

    result = await bidi_session.moz.profiler.stop()
    assert result["path"] is None
    assert await is_profiler_active() is False


async def test_stop_twice(bidi_session, is_profiler_active):
    await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)
    assert await is_profiler_active() is True

    await bidi_session.moz.profiler.stop(discard=True)
    await bidi_session.moz.profiler.stop(discard=True)
    assert await is_profiler_active() is False


async def test_stop_discard(bidi_session, is_profiler_active):
    await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)
    assert await is_profiler_active() is True

    result = await bidi_session.moz.profiler.stop(discard=True)
    assert await is_profiler_active() is False
    assert result["path"] is None


async def test_stop_saves_profile(bidi_session, is_profiler_active):
    await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)
    assert await is_profiler_active() is True

    result = await bidi_session.moz.profiler.stop()
    assert await is_profiler_active() is False

    path = result["path"]
    assert path is not None
    assert os.path.exists(path)
    assert os.path.getsize(path) > 0

    try:
        with open(path) as f:
            profile = json.load(f)

        assert "meta" in profile
        assert "threads" in profile
        assert isinstance(profile["threads"], list)
    finally:
        os.remove(path)


async def test_stop_saved_profile_reflects_start_options(bidi_session):
    options = {
        "entries": 1000000,
        "interval": 2,
        "features": ["js", "stackwalk"],
        "threads": ["GeckoMain"],
    }
    await bidi_session.moz.profiler.start(**options)

    result = await bidi_session.moz.profiler.stop()
    path = result["path"]
    assert path is not None

    try:
        with open(path) as f:
            profile = json.load(f)

        configuration = profile["meta"]["configuration"]
        assert configuration["interval"] == options["interval"]
        for thread in options["threads"]:
            assert thread in configuration["threads"]
        for feature in options["features"]:
            assert feature in configuration["features"]
    finally:
        os.remove(path)
