import pytest
from tests.bidi import get_invalid_cases
from webdriver.bidi import error

from .. import DEFAULT_START_OPTIONS

pytestmark = pytest.mark.asyncio


def _options_without(*keys):
    return {k: v for k, v in DEFAULT_START_OPTIONS.items() if k not in keys}


@pytest.mark.parametrize("value", get_invalid_cases("number"))
async def test_params_entries_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("entries"), entries=value
        )


@pytest.mark.parametrize("value", [-1, 1.5])
async def test_params_entries_invalid_value(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("entries"), entries=value
        )


@pytest.mark.parametrize("value", get_invalid_cases("number"))
async def test_params_interval_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("interval"), interval=value
        )


@pytest.mark.parametrize("value", [-1])
async def test_params_interval_invalid_value(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("interval"), interval=value
        )


@pytest.mark.parametrize("value", get_invalid_cases("list"))
async def test_params_features_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("features"), features=value
        )


@pytest.mark.parametrize("value", [[42], [None], [False], [{}], ["js", 42]])
async def test_params_features_invalid_item(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("features"), features=value
        )


@pytest.mark.parametrize("value", get_invalid_cases("list"))
async def test_params_threads_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("threads"), threads=value
        )


@pytest.mark.parametrize("value", [[42], [None], [False], [{}], ["GeckoMain", 42]])
async def test_params_threads_invalid_item(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **_options_without("threads"), threads=value
        )


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_params_active_context_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(
            **DEFAULT_START_OPTIONS, active_context=value
        )


async def test_params_active_context_no_such_frame(bidi_session):
    with pytest.raises(error.NoSuchFrameException):
        await bidi_session.moz.profiler.start(
            **DEFAULT_START_OPTIONS, active_context="does-not-exist"
        )


async def test_no_options(bidi_session):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start()


@pytest.mark.parametrize("missing", ["entries", "interval", "features", "threads"])
async def test_missing_required_param(bidi_session, missing):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(**_options_without(missing))


@pytest.mark.parametrize("value", get_invalid_cases("string"))
async def test_params_preset_invalid_type(bidi_session, value):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(preset=value)


async def test_params_preset_unknown(bidi_session):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(preset="not-a-real-preset")


@pytest.mark.parametrize("key", ["entries", "interval", "features", "threads"])
async def test_preset_combined_with_explicit_option(bidi_session, key):
    options = {"preset": "web-developer", key: DEFAULT_START_OPTIONS[key]}
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.start(**options)
