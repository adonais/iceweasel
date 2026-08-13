def back(session):
    return session.transport.send(
        "POST", "session/{session_id}/back".format(**vars(session))
    )
