import os
from copy import deepcopy

import pytest
from webdriver.error import InvalidArgumentException


def test_bad_binary(configuration, geckodriver):
    # skipif annotations are forbidden in wpt
    if os.path.exists("/bin/echo"):
        config = deepcopy(configuration)
        config["capabilities"]["moz:firefoxOptions"]["binary"] = "/bin/echo"

        driver = geckodriver(config=config, force_new=True)
        with pytest.raises(InvalidArgumentException):
            driver.new_session()


def test_shell_script_binary(configuration, geckodriver):
    # skipif annotations are forbidden in wpt
    if os.path.exists("/bin/bash"):
        binary = configuration["browser"]["binary"]

        path = os.path.abspath("firefox.sh")
        assert not os.path.exists(path)
        try:
            script = f"""#!/bin/bash\n\n"{binary}" $@\n"""
            with open("firefox.sh", "w") as f:
                f.write(script)
            os.chmod(path, 0o744)

            config = deepcopy(configuration)
            config["capabilities"]["moz:firefoxOptions"]["binary"] = path

            driver = geckodriver(config=config, force_new=True)
            driver.new_session()
        finally:
            os.unlink(path)
