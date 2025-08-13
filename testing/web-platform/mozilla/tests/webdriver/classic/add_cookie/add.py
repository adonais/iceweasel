from tests.support.asserts import assert_error
from tests.support.helpers import clear_all_cookies


def add_cookie(session, cookie):
    return session.transport.send(
        "POST",
        "session/{session_id}/cookie".format(**vars(session)),
        {"cookie": cookie},
    )


def test_invalid_samesite_none_and_not_secure(session, url):
    session.url = url("/common/blank.html")
    clear_all_cookies(session)

    name = "foo"
    value = "bar"

    session.execute_script(f"document.cookie='{name}={value}'")

    cookie = session.cookies(name)

    # Set a cookie with exactly the same values as they are set with `document.cookie`.
    result = add_cookie(
        session,
        {
            "name": "foo2",
            "value": cookie["value"],
            "sameSite": cookie["sameSite"],
            "secure": cookie["secure"],
            "httpOnly": cookie["httpOnly"],
        },
    )

    assert_error(result, "unable to set cookie")

    clear_all_cookies(session)
