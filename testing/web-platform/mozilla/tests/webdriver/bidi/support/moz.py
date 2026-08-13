from typing import Any

from bidi.support.debugging import Debugging
from bidi.support.profiler import Profiler


class Moz:
    def __init__(self, bidi_session: Any):
        self.debugging = Debugging(bidi_session)
        self.profiler = Profiler(bidi_session)
