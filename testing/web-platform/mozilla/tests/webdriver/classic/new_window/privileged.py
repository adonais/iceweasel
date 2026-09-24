from tests.support.classic.asserts import assert_success


def new_window(session, type_hint):
    return session.transport.send(
        "POST", f"session/{session.session_id}/window/new", {"type": type_hint}
    )


# Opening a new tab doesn't interact with the page content.


def test_parent_process_context_without_system_access(parent_process_session):
    response = new_window(parent_process_session, "tab")
    assert_success(response)


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = new_window(session, "tab")
    assert_success(response)
