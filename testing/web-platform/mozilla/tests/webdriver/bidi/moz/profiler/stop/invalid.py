import pytest
from tests.bidi import get_invalid_cases
from webdriver.bidi import error

from .. import DEFAULT_START_OPTIONS

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("value", get_invalid_cases("boolean"))
async def test_params_discard_invalid_type(bidi_session, is_profiler_active, value):
    await bidi_session.moz.profiler.start(**DEFAULT_START_OPTIONS)
    assert await is_profiler_active() is True

    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.moz.profiler.stop(discard=value)
