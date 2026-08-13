# {mod}`mozpower` --- Power-usage testing

Mozpower provides an interface through which power usage measurements
can be done on any OS and CPU combination (auto-detected) that has
been implemented within the module. It provides 2 methods to start
and stop the measurement gathering as well as methods to get the
result that can also be formatted into a perfherder data blob.

## Basic Usage

Although multiple classes exist within the mozpower module,
the only one that should be used is MozPower which is accessible
from the top-level of the module. It handles which subclasses
should be used depending on the detected OS and CPU combination.

```python
from mozpower import MozPower

mp = MozPower(
    ipg_measure_duration=600,
    sampling_rate=1000,
    output_file_path='tempdir/dataprefix'
)
mp.initialize_power_measurements()

# Run test TEST_NAME

mp.finalize_power_measurements(
    test_name=TEST_NAME,
    output_dir_path=env['MOZ_UPLOAD_DIR']
)

# Get complete PERFHERDER_DATA
perfherder_data = mp.get_full_perfherder_data('raptor')
```

All the possible known errors that can occur are also provided
at the top-level of the module.

```python
from mozpower import MozPower, IPGExecutableMissingError, OsCpuComboMissingError

try:
    mp = MozPower(ipg_measure_duration=600, sampling_rate=1000)
except IPGExecutableMissingError as e:
    pass
except OsCpuComboMissingError as e:
    pass
```

```{eval-rst}
.. automodule:: mozpower
```

(mozpower)=

## MozPower Interface

The following class provides a basic interface to interact with the
power measurement tools that have been implemented. The tool used
to measure power depends on the OS and CPU combination, i.e. Intel-based
MacOS machines would use Intel Power Gadget, while ARM64-based Windows
machines would use the native Windows tool powercfg.

### MozPower

```{eval-rst}
.. autoclass:: mozpower.MozPower
```

#### Measurement methods

```{eval-rst}
.. automethod:: MozPower.initialize_power_measurements(self, **kwargs)
```

```{eval-rst}
.. automethod:: MozPower.finalize_power_measurements(self, **kwargs)
```

#### Informational methods

```{eval-rst}
.. automethod:: MozPower.get_perfherder_data(self)
```

```{eval-rst}
.. automethod:: MozPower.get_full_perfherder_data(self, framework, lowerisbetter=True, alertthreshold=2.0)
```

### IPGEmptyFileError

```{eval-rst}
.. autoexception:: mozpower.IPGEmptyFileError
```

### IPGExecutableMissingError

```{eval-rst}
.. autoexception:: mozpower.IPGExecutableMissingError
```

### IPGMissingOutputFileError

```{eval-rst}
.. autoexception:: mozpower.IPGMissingOutputFileError
```

### IPGTimeoutError

```{eval-rst}
.. autoexception:: mozpower.IPGTimeoutError
```

### IPGUnknownValueTypeError

```{eval-rst}
.. autoexception:: mozpower.IPGUnknownValueTypeError
```

### MissingProcessorInfoError

```{eval-rst}
.. autoexception:: mozpower.MissingProcessorInfoError
```

### OsCpuComboMissingError

```{eval-rst}
.. autoexception:: mozpower.OsCpuComboMissingError
```

### PlatformUnsupportedError

```{eval-rst}
.. autoexception:: mozpower.PlatformUnsupportedError
```
