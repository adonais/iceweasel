import pytest
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


@pytest.mark.geckodriver(allow_system_access=True)
async def test_mutual_exclusive_with_scope(bidi_session, top_context):
    with pytest.raises(error.InvalidArgumentException):
        await bidi_session.browsing_context.get_tree(
            root=top_context["context"], _extension_params={"moz:scope": "chrome"}
        )
