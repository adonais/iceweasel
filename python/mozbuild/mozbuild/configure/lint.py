# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import inspect
import re
import types
from dis import Bytecode
from functools import cache, wraps
from io import StringIO
from itertools import pairwise

import mozpack.path as mozpath

from . import (
    CombinedDependsFunction,
    ConfigureError,
    ConfigureSandbox,
    DependsFunction,
    SandboxDependsFunction,
    SandboxedGlobal,
    TrivialDependsFunction,
)
from .help import HelpFormatter


def code_replace(code, co_filename, co_name, co_firstlineno):
    return code.replace(
        co_filename=co_filename, co_name=co_name, co_firstlineno=co_firstlineno
    )


SUBST_CONSUMER_SUFFIXES = {
    ".build",
    ".conf",
    ".gradle",
    ".groovy",
    ".in",
    ".kt",
    ".kts",
    ".mk",
    ".mozbuild",
    ".py",
}


def find_unreferenced_configs(names, topsrcdir, paths):
    word = re.compile(r"\w+")
    unreferenced = set(names)
    for path in paths:
        suffix = mozpath.splitext(path)[1]
        if suffix and suffix not in SUBST_CONSUMER_SUFFIXES:
            continue
        with open(
            mozpath.join(topsrcdir, path), encoding="utf-8", errors="replace"
        ) as fh:
            for line in fh:
                stripped = line.lstrip()
                # Skip comments and preprocessor conditions, but keep a substitution
                # such as "#define FOO @FOO@".
                if not stripped.startswith("#") or "@" in stripped:
                    unreferenced.difference_update(word.findall(line))
        if not unreferenced:
            break
    return sorted(unreferenced)


class LintSandbox(ConfigureSandbox):
    def __init__(self, environ=None, argv=None, stdout=None, stderr=None):
        out = StringIO()
        stdout = stdout or out
        stderr = stderr or out
        environ = environ or {}
        argv = argv or []
        self._wrapped = {}
        self._has_imports = set()
        self._bool_options = []
        self._bool_func_options = []
        self.set_configs = {}
        self.defined_depends = {}
        self._used_depends = set()
        self._checked = set()
        self._decorated = {}
        self.LOG = ""
        super().__init__({}, environ=environ, argv=argv, stdout=stdout, stderr=stderr)

    def run(self, path=None):
        if path:
            self.include_file(path)

        for dep in self._depends.values():
            self._check_dependencies(dep)

    def _raise_from(self, exception, obj, line=0):
        """
        Raises the given exception as if it were emitted from the given
        location.

        The location is determined from the values of obj and line.

        - ``obj`` can be a function or DependsFunction, in which case
          ``line`` corresponds to the line within the function the exception
          will be raised from (as an offset from the function's firstlineno).
        - ``obj`` can be a stack frame, in which case ``line`` is ignored.
        """

        def thrower(e):
            raise e

        if isinstance(obj, DependsFunction):
            obj, _ = self.unwrap(obj._func)

        if inspect.isfunction(obj):
            funcname = obj.__name__
            filename = obj.__code__.co_filename
            firstline = obj.__code__.co_firstlineno
            line += firstline - 1
        elif inspect.isframe(obj):
            funcname = obj.f_code.co_name
            filename = obj.f_code.co_filename
            firstline = obj.f_code.co_firstlineno
            line = obj.f_lineno - 1
        else:
            # Don't know how to handle the given location, still raise the
            # exception.
            raise exception

        # Create a new function from the above thrower that pretends
        # the `raise` line is on the line given as argument.

        code = code_replace(
            thrower.__code__,
            co_filename=filename,
            co_name=funcname,
            co_firstlineno=line,
        )

        thrower = types.FunctionType(
            code,
            thrower.__globals__,
            funcname,
            thrower.__defaults__,
            thrower.__closure__,
        )
        thrower(exception)

    def _check_dependencies(self, obj):
        if isinstance(obj, CombinedDependsFunction) or obj in (
            self._always,
            self._never,
        ):
            return
        if not inspect.isroutine(obj._func):
            return
        func, glob = self.unwrap(obj._func)
        func_args = inspect.getfullargspec(func)
        if func_args.varkw:
            e = ConfigureError(
                "Keyword arguments are not allowed in @depends functions"
            )
            self._raise_from(e, func)

        all_args = list(func_args.args)
        if func_args.varargs:
            all_args.append(func_args.varargs)
        used_args = set()

        for instr in Bytecode(func):
            if instr.opname == "LOAD_FAST_LOAD_FAST":
                for argval in instr.argval:
                    if argval in all_args:
                        used_args.add(argval)
            elif instr.opname in ("LOAD_FAST", "LOAD_CLOSURE"):
                if instr.argval in all_args:
                    used_args.add(instr.argval)

        for num, arg in enumerate(all_args):
            if arg not in used_args:
                dep = obj.dependencies[num]
                if dep != self._help_option or not self._need_help_dependency(obj):
                    if isinstance(dep, DependsFunction):
                        dep = dep.name
                    else:
                        dep = dep.option
                    e = ConfigureError("The dependency on `%s` is unused" % dep)
                    self._raise_from(e, func)

    def _need_help_dependency(self, obj):
        if isinstance(obj, (CombinedDependsFunction, TrivialDependsFunction)):
            return False
        if isinstance(obj, DependsFunction):
            if obj in (self._always, self._never) or not inspect.isroutine(obj._func):
                return False
            func, glob = self.unwrap(obj._func)
            # We allow missing --help dependencies for functions that:
            # - don't use @imports
            # - don't have a closure
            # - don't use global variables
            if func in self._has_imports or func.__closure__:
                return True
            for instr in Bytecode(func):
                if instr.opname in ("LOAD_GLOBAL", "STORE_GLOBAL"):
                    # There is a fake os module when one is not imported,
                    # and it's allowed for functions without a --help
                    # dependency.
                    if instr.argval == "os" and glob.get("os") is self.OS:
                        continue
                    if instr.argval in self.BUILTINS:
                        continue
                    if instr.argval in "namespace":
                        continue
                    return True
        return False

    def _missing_help_dependency(self, obj):
        if isinstance(obj, DependsFunction) and self._help_option in obj.dependencies:
            return False
        return self._need_help_dependency(obj)

    @cache
    def _value_for_depends(self, obj):
        with_help = self._help_option in obj.dependencies
        if with_help:
            for arg in obj.dependencies:
                if self._missing_help_dependency(arg):
                    e = ConfigureError(
                        "Missing '--help' dependency because `%s` depends on "
                        "'--help' and `%s`" % (obj.name, arg.name)
                    )
                    self._raise_from(e, arg)
        elif self._missing_help_dependency(obj):
            e = ConfigureError("Missing '--help' dependency")
            self._raise_from(e, obj)
        return super()._value_for_depends(obj)

    def __setitem__(self, key, value):
        frame = inspect.currentframe().f_back
        # Only module level functions are recorded, because each template call
        # creates a new `@depends` function that only some callers read.
        if (
            isinstance(value, SandboxDependsFunction)
            and frame.f_code.co_name == "<module>"
            and self._is_defined_as(self._function(self._depends[value]), key)
        ):
            self.defined_depends.setdefault(
                self._depends[value], (key, frame.f_code.co_filename, frame.f_lineno)
            )
        return super().__setitem__(key, value)

    def _function(self, obj):
        return self._decorated.get(obj, obj._func)

    def _is_defined_as(self, func, key):
        if not inspect.isroutine(func):
            return False
        func, _ = self.unwrap(func)
        return func.__name__ == key or func.__qualname__ == "<lambda>"

    def _mark_used(self, *values):
        for value in values:
            if isinstance(value, SandboxDependsFunction):
                self._used_depends.add(self._depends[value])

    def _normalize_when(self, when, callee_name):
        self._mark_used(when)
        return super()._normalize_when(when, callee_name)

    def unreferenced_depends(self):
        """Return the module level `@depends` functions that nothing reads.

        A function is read when:

        - it is passed to `set_config`, `set_define`, `imply_option`,
          `include`, `option` or a `when`,
        - another `@depends` function depends on it, or
        - `checking` prints its value.

        A function with no `return` value is a check, so it is never reported.
        """
        used = set(self._used_depends)
        # A function is read by any function that depends on it, even one that is
        # itself unreferenced. Removing that one exposes the next.
        for obj in self._depends.values():
            used.update(d for d in obj.dependencies if isinstance(d, DependsFunction))
            if isinstance(obj.when, DependsFunction):
                used.add(obj.when)
        used.update(
            obj
            for obj in self.defined_depends
            if self._is_checked(self._function(obj))
            or not self._has_return_value(self._function(obj))
        )
        return {
            location
            for obj, location in self.defined_depends.items()
            if obj not in used
        }

    def _is_checked(self, func):
        return func in self._checked or (
            func in self._wrapped and self._is_checked(self._wrapped[func])
        )

    def _has_return_value(self, func):
        func, _ = self.unwrap(func)
        for previous, instr in pairwise(Bytecode(func)):
            if instr.opname == "RETURN_CONST" and instr.argval is not None:
                return True
            if instr.opname == "RETURN_VALUE" and not (
                previous.opname == "LOAD_CONST" and previous.argval is None
            ):
                return True
        return False

    def option_impl(self, *args, **kwargs):
        self._mark_used(*args, *kwargs.values())
        result = super().option_impl(*args, **kwargs)
        when = self._conditions.get(result)
        if when:
            self._value_for(when)

        self._check_option(result, *args, **kwargs)

        return result

    def set_config_impl(self, name, value, when=None):
        frame = inspect.currentframe().f_back
        if frame.f_code.co_name == "<module>":
            self.set_configs.setdefault(
                name, (frame.f_code.co_filename, frame.f_lineno)
            )
        self._mark_used(name, value)
        return super().set_config_impl(name, value, when)

    def set_define_impl(self, name, value, when=None):
        self._mark_used(name, value)
        return super().set_define_impl(name, value, when)

    def imply_option_impl(self, option, value, reason=None, when=None):
        self._mark_used(value)
        return super().imply_option_impl(option, value, reason, when)

    def include_impl(self, what, when=None):
        self._mark_used(what)
        return super().include_impl(what, when)

    def _check_option(self, option, *args, **kwargs):
        self._check_help_message(option, *args, **kwargs)

        if len(args) == 0:
            return

        self._check_prefix_for_bool_option(*args, **kwargs)
        self._check_help_for_option(option, *args, **kwargs)

    def _pretty_current_frame(self):
        frame = inspect.currentframe()
        while frame and frame.f_code.co_name != self.option_impl.__name__:
            frame = frame.f_back
        return frame

    def _check_prefix_for_bool_option(self, *args, **kwargs):
        name = args[0]
        default = kwargs.get("default")

        if type(default) is not bool:
            return

        table = {
            True: {
                "enable": "disable",
                "with": "without",
            },
            False: {
                "disable": "enable",
                "without": "with",
            },
        }
        for prefix, replacement in table[default].items():
            if name.startswith(f"--{prefix}-"):
                frame = self._pretty_current_frame()
                e = ConfigureError(
                    "{} should be used instead of {} with default={}".format(
                        name.replace(f"--{prefix}-", f"--{replacement}-"),
                        name,
                        default,
                    )
                )
                self._raise_from(e, frame.f_back if frame else None)

    def _check_help_for_option(self, option, *args, **kwargs):
        if not option.prefix:
            return

        check = None

        default = kwargs.get("default")
        if isinstance(default, SandboxDependsFunction):
            default = self._resolve(default)
            if type(default) is not str:
                check = "of non-constant default"

        if (
            option.default
            and len(option.default) == 0
            and option.choices
            and option.nargs in ("?", "*")
        ):
            check = "it can be both disabled and enabled with an optional value"

        if not check:
            return

        help = kwargs["help"]
        match = re.search(HelpFormatter.RE_FORMAT, help)
        if match:
            return

        if option.prefix in ("enable", "disable"):
            rule = "{Enable|Disable}"
        else:
            rule = "{With|Without}"

        frame = self._pretty_current_frame()
        e = ConfigureError(f'`help` should contain "{rule}" because {check}')
        self._raise_from(e, frame.f_back if frame else None)

    def _check_help_message(self, option, *args, **kwargs):
        help = kwargs["help"]
        if help[:1].islower():
            error_msg = f"`{help}` is not properly capitalized"
        elif help.endswith("."):
            error_msg = f"`{help}` should not end with a '.'"
        elif match := re.search(HelpFormatter.RE_FORMAT, help):
            for choice in match.groups():
                if choice[:1].islower():
                    error_msg = f"`{choice}` is not properly capitalized"
                    break
            else:
                return
        else:
            return

        frame = self._pretty_current_frame()
        e = ConfigureError(
            f'Invalid `help` message for option "{option.option}": {error_msg}'
        )
        self._raise_from(e, frame.f_back if frame else None)

    def unwrap(self, func):
        glob = func.__globals__
        while func in self._wrapped:
            if isinstance(func.__globals__, SandboxedGlobal):
                glob = func.__globals__
            func = self._wrapped[func]
        return func, glob

    def wraps(self, func):
        def do_wraps(wrapper):
            self._wrapped[wrapper] = func
            return wraps(func)(wrapper)

        return do_wraps

    def template_impl(self, func):
        template = super().template_impl(func)
        # `checking` prints the value of the function it decorates, which counts
        # as a read. `depends_tmpl` hides the function behind its own `wrapper`.
        if func.__name__ not in ("checking", "depends_tmpl"):
            return template

        def wrapper(*args, **kwargs):
            decorator = template(*args, **kwargs)

            def record(decorated):
                result = decorator(decorated)
                if func.__name__ == "checking":
                    self._checked.add(result)
                else:
                    self._decorated[self._depends[result]] = decorated
                return result

            return record

        self._templates.add(wrapper)
        return wrapper

    def imports_impl(self, _import, _from=None, _as=None):
        wrapper = super().imports_impl(_import, _from=_from, _as=_as)

        def decorator(func):
            self._has_imports.add(func)
            return wrapper(func)

        return decorator

    def _prepare_function(self, func, update_globals=None):
        wrapped = super()._prepare_function(func, update_globals)
        _, glob = self.unwrap(wrapped)
        imports = set()
        for _from, _import, _as in self._imports.get(func, ()):
            if _as:
                imports.add(_as)
            else:
                what = _import.split(".")[0]
                imports.add(what)
            if _from == "__builtin__" and _import in glob["__builtins__"]:
                e = NameError(f"builtin '{_import}' doesn't need to be imported")
                self._raise_from(e, func)
        for instr in Bytecode(func):
            code = func.__code__
            if (
                instr.opname == "LOAD_GLOBAL"
                and instr.argval not in glob
                and instr.argval not in imports
                and instr.argval not in glob["__builtins__"]
                and instr.argval not in code.co_varnames[: code.co_argcount]
            ):
                # Raise the same kind of error as what would happen during
                # execution.
                e = NameError(f"global name '{instr.argval}' is not defined")
                # python 3.13 changed .starts_line to be a bool and moved the
                # line number itself to .line_number.
                line_number = getattr(instr, "line_number", instr.starts_line)
                if line_number is None:
                    self._raise_from(e, func)
                else:
                    self._raise_from(e, func, line_number - code.co_firstlineno)

        return wrapped
