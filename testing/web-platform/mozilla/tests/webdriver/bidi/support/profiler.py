from typing import Any, List, Mapping

from webdriver.bidi.modules._module import BidiModule, command
from webdriver.bidi.undefined import UNDEFINED, Maybe


class Profiler(BidiModule):
    prefix = "moz"

    @command
    def is_active(self) -> Mapping[str, Any]:
        return {}

    @command
    def start(
        self,
        preset: Maybe[str] = UNDEFINED,
        entries: Maybe[int] = UNDEFINED,
        interval: Maybe[float] = UNDEFINED,
        features: Maybe[List[str]] = UNDEFINED,
        threads: Maybe[List[str]] = UNDEFINED,
        active_context: Maybe[str] = UNDEFINED,
    ) -> Mapping[str, Any]:
        return {
            "preset": preset,
            "entries": entries,
            "interval": interval,
            "features": features,
            "threads": threads,
            "activeContext": active_context,
        }

    @command
    def stop(self, discard: Maybe[bool] = UNDEFINED) -> Mapping[str, Any]:
        return {"discard": discard}
