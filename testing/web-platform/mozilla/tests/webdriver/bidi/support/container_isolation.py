import pytest

# Restrict the WebDriver BiDi session to a dedicated container.
container_isolation = pytest.mark.capabilities({
    "moz:firefoxOptions": {
        "prefs": {
            "remote.experimental.dynamicstart.container-isolation-enabled": True,
            "remote.experimental.dynamicstart.force-container": True,
        }
    }
})
