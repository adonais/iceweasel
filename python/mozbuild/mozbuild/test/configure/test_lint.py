# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import sys
import textwrap
import traceback
import unittest

import mozpack.path as mozpath
from mozunit import MockedOpen, main

from mozbuild.configure import ConfigureError
from mozbuild.configure.lint import LintSandbox, find_unreferenced_configs

test_data_path = mozpath.abspath(mozpath.dirname(__file__))
test_data_path = mozpath.join(test_data_path, "data")


class AssertRaisesFromLine:
    def __init__(self, test_case, expected, path, line):
        self.test_case = test_case
        self.expected = expected
        self.path = path
        self.line = line

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, tb):
        if exc_type is None:
            raise Exception(f"{self.expected.__name__} not raised")
        if not issubclass(exc_type, self.expected):
            return False
        self.exception = exc_value
        self.test_case.assertEqual(
            traceback.extract_tb(tb)[-1][:2], (self.path, self.line)
        )
        return True


class TestLint(unittest.TestCase):
    def lint_test(self, options=[], env={}):
        sandbox = LintSandbox(env, ["configure"] + options)

        sandbox.run(mozpath.join(test_data_path, "moz.configure"))
        return sandbox

    def moz_configure(self, source):
        return MockedOpen({
            os.path.join(test_data_path, "moz.configure"): textwrap.dedent(source)
        })

    def assertRaisesFromLine(self, exc_type, line):
        return AssertRaisesFromLine(
            self, exc_type, mozpath.join(test_data_path, "moz.configure"), line
        )

    def test_configure_testcase(self):
        # Lint python/mozbuild/mozbuild/test/configure/data/moz.configure
        self.lint_test()

    def test_depends_failures(self):
        with self.moz_configure(
            """
            option('--foo', help='Foo')
            @depends('--foo')
            def foo(value):
                return value

            @depends('--help', foo)
            @imports('os')
            def bar(help, foo):
                return foo
        """
        ):
            self.lint_test()

        with self.assertRaisesFromLine(ConfigureError, 7) as e:
            with self.moz_configure(
                """
                option('--foo', help='Foo')
                @depends('--foo')
                def foo(value):
                    return value

                @depends('--help', foo)
                def bar(help, foo):
                    return foo
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "The dependency on `--help` is unused")

        with self.assertRaisesFromLine(ConfigureError, 3) as e:
            with self.moz_configure(
                """
                option('--foo', help='Foo')
                @depends('--foo')
                @imports('os')
                def foo(value):
                    return value

                @depends('--help', foo)
                @imports('os')
                def bar(help, foo):
                    return foo
            """
            ):
                self.lint_test()

        self.assertEqual(
            str(e.exception),
            "Missing '--help' dependency because `bar` depends on '--help' and `foo`",
        )

        with self.assertRaisesFromLine(ConfigureError, 7) as e:
            with self.moz_configure(
                """
                @template
                def tmpl():
                    qux = 42

                    option('--foo', help='Foo')
                    @depends('--foo')
                    def foo(value):
                        qux
                        return value

                    @depends('--help', foo)
                    @imports('os')
                    def bar(help, foo):
                        return foo
                tmpl()
            """
            ):
                self.lint_test()

        self.assertEqual(
            str(e.exception),
            "Missing '--help' dependency because `bar` depends on '--help' and `foo`",
        )

        with self.moz_configure(
            """
            option('--foo', help='Foo')
            @depends('--foo')
            def foo(value):
                return value

            include(foo)
        """
        ):
            self.lint_test()

        with self.assertRaisesFromLine(ConfigureError, 3) as e:
            with self.moz_configure(
                """
                option('--foo', help='Foo')
                @depends('--foo')
                @imports('os')
                def foo(value):
                    return value

                include(foo)
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "Missing '--help' dependency")

        with self.assertRaisesFromLine(ConfigureError, 3) as e:
            with self.moz_configure(
                """
                option('--foo', help='Foo')
                @depends('--foo')
                @imports('os')
                def foo(value):
                    return value

                @depends(foo)
                def bar(value):
                    return value

                include(bar)
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "Missing '--help' dependency")

        with self.assertRaisesFromLine(ConfigureError, 3) as e:
            with self.moz_configure(
                """
                option('--foo', help='Foo')
                @depends('--foo')
                @imports('os')
                def foo(value):
                    return value

                option('--bar', help='Bar', when=foo)
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "Missing '--help' dependency")

        # This would have failed with "Missing '--help' dependency"
        # in the past, because of the reference to the builtin False.
        with self.moz_configure(
            """
            option('--foo', help='Foo')
            @depends('--foo')
            def foo(value):
                return False or value

            option('--bar', help='Bar', when=foo)
        """
        ):
            self.lint_test()

        # However, when something that is normally a builtin is overridden,
        # we should still want the dependency on --help.
        with self.assertRaisesFromLine(ConfigureError, 7) as e:
            with self.moz_configure(
                """
                @template
                def tmpl():
                    sorted = 42

                    option('--foo', help='Foo')
                    @depends('--foo')
                    def foo(value):
                        return sorted

                    option('--bar', help='Bar', when=foo)
                tmpl()
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "Missing '--help' dependency")

        # There is a default restricted `os` module when there is no explicit
        # @imports, and it's fine to use it without a dependency on --help.
        with self.moz_configure(
            """
            option('--foo', help='Foo')
            @depends('--foo')
            def foo(value):
                os
                return value

            include(foo)
        """
        ):
            self.lint_test()

        with self.assertRaisesFromLine(ConfigureError, 3) as e:
            with self.moz_configure(
                """
                option('--foo', help='Foo')
                @depends('--foo')
                def foo(value):
                    return

                include(foo)
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "The dependency on `--foo` is unused")

        with self.assertRaisesFromLine(ConfigureError, 5) as e:
            with self.moz_configure(
                """
                @depends(when=True)
                def bar():
                    return
                @depends(bar)
                def foo(value):
                    return

                include(foo)
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "The dependency on `bar` is unused")

        with self.assertRaisesFromLine(ConfigureError, 2) as e:
            with self.moz_configure(
                """
                @depends(depends(when=True)(lambda: None))
                def foo(value):
                    return

                include(foo)
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "The dependency on `<lambda>` is unused")

        with self.assertRaisesFromLine(ConfigureError, 9) as e:
            with self.moz_configure(
                """
                @template
                def tmpl():
                    @depends(when=True)
                    def bar():
                        return
                    return bar
                qux = tmpl()
                @depends(qux)
                def foo(value):
                    return

                include(foo)
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "The dependency on `qux` is unused")

    def test_default_enable(self):
        # --enable-* with default=True is not allowed.
        with self.moz_configure(
            """
            option('--enable-foo', default=False, help='Foo')
        """
        ):
            self.lint_test()
        with self.assertRaisesFromLine(ConfigureError, 2) as e:
            with self.moz_configure(
                """
                option('--enable-foo', default=True, help='Foo')
            """
            ):
                self.lint_test()
        self.assertEqual(
            str(e.exception),
            "--disable-foo should be used instead of --enable-foo with default=True",
        )

    def test_default_disable(self):
        # --disable-* with default=False is not allowed.
        with self.moz_configure(
            """
            option('--disable-foo', default=True, help='Foo')
        """
        ):
            self.lint_test()
        with self.assertRaisesFromLine(ConfigureError, 2) as e:
            with self.moz_configure(
                """
                option('--disable-foo', default=False, help='Foo')
            """
            ):
                self.lint_test()
        self.assertEqual(
            str(e.exception),
            "--enable-foo should be used instead of --disable-foo with default=False",
        )

    def test_default_with(self):
        # --with-* with default=True is not allowed.
        with self.moz_configure(
            """
            option('--with-foo', default=False, help='Foo')
        """
        ):
            self.lint_test()
        with self.assertRaisesFromLine(ConfigureError, 2) as e:
            with self.moz_configure(
                """
                option('--with-foo', default=True, help='Foo')
            """
            ):
                self.lint_test()
        self.assertEqual(
            str(e.exception),
            "--without-foo should be used instead of --with-foo with default=True",
        )

    def test_default_without(self):
        # --without-* with default=False is not allowed.
        with self.moz_configure(
            """
            option('--without-foo', default=True, help='Foo')
        """
        ):
            self.lint_test()
        with self.assertRaisesFromLine(ConfigureError, 2) as e:
            with self.moz_configure(
                """
                option('--without-foo', default=False, help='Foo')
            """
            ):
                self.lint_test()
        self.assertEqual(
            str(e.exception),
            "--with-foo should be used instead of --without-foo with default=False",
        )

    def test_default_func(self):
        # Help text for an option with variable default should contain
        # {enable|disable} rule.
        with self.moz_configure(
            """
            option(env='FOO', help='Foo')
            option('--enable-bar', default=depends('FOO')(lambda x: bool(x)),
                   help='{Enable|Disable} bar')
        """
        ):
            self.lint_test()
        with self.assertRaisesFromLine(ConfigureError, 3) as e:
            with self.moz_configure(
                """
                option(env='FOO', help='Foo')
                option('--enable-bar', default=depends('FOO')(lambda x: bool(x)),\
                       help='Enable bar')
            """
            ):
                self.lint_test()
        self.assertEqual(
            str(e.exception),
            '`help` should contain "{Enable|Disable}" because of non-constant default',
        )

    def test_dual_help(self):
        # Help text for an option that can be both disabled and enabled with an
        # optional value should contain {enable|disable} rule.
        with self.moz_configure(
            """
            option('--disable-bar', nargs="*", choices=("a", "b"),
                   help='{Enable|Disable} bar')
        """
        ):
            self.lint_test()
        with self.assertRaisesFromLine(ConfigureError, 2) as e:
            with self.moz_configure(
                """
                option('--disable-bar', nargs="*", choices=("a", "b"), help='Enable bar')
            """
            ):
                self.lint_test()
        self.assertEqual(
            str(e.exception),
            '`help` should contain "{Enable|Disable}" because it '
            "can be both disabled and enabled with an optional value",
        )

    def test_capitalize_help(self):
        with self.moz_configure("option('--some', help='Help')"):
            self.lint_test()

        with self.assertRaisesFromLine(ConfigureError, 1) as e0:
            with self.moz_configure("option('--some', help='help')"):
                self.lint_test()
        self.assertEqual(
            str(e0.exception),
            'Invalid `help` message for option "--some": `help` is not properly capitalized',
        )

        with self.assertRaisesFromLine(ConfigureError, 1) as e1:
            with self.moz_configure("option('--some', help='Help.')"):
                self.lint_test()
        self.assertEqual(
            str(e1.exception),
            "Invalid `help` message for option \"--some\": `Help.` should not end with a '.'",
        )

        with self.moz_configure(
            """
            option(env='SOME', help='Foo', default='a')
            option('--enable-some', nargs='*', choices=('a', 'b'),
                   help='{Enable|Disable} some',
                   default=depends('SOME')(lambda x: x[0]))
            """
        ):
            self.lint_test()

        with self.assertRaisesFromLine(ConfigureError, 3) as e2:
            with self.moz_configure(
                """
                option(env='SOME', help='Foo', default='a')
                option('--enable-some', nargs='*', choices=('a', 'b'),
                       help='{enable|Disable} some',
                       default=depends('SOME')(lambda x: x[0]))
                """
            ):
                self.lint_test()
        self.assertEqual(
            str(e2.exception),
            'Invalid `help` message for option "--enable-some": `enable` is not properly capitalized',
        )

        with self.assertRaisesFromLine(ConfigureError, 3) as e3:
            with self.moz_configure(
                """
                option(env='SOME', help='Foo', default='a')
                option('--enable-some', nargs='*', choices=('a', 'b'),
                       help='enable some',
                       default=depends('SOME')(lambda x: x[0]))
                """
            ):
                self.lint_test()
        self.assertEqual(
            str(e3.exception),
            'Invalid `help` message for option "--enable-some": `enable some` is not properly capitalized',
        )

    def test_large_offset(self):
        with self.assertRaisesFromLine(ConfigureError, 375):
            with self.moz_configure(
                """
                option(env='FOO', help='Foo')
            """
                + "\n" * 371
                + """
                option('--enable-bar', default=depends('FOO')(lambda x: bool(x)),\
                       help='Enable bar')
            """
            ):
                self.lint_test()

    def test_undefined_global(self):
        with self.assertRaisesFromLine(NameError, 6) as e:
            with self.moz_configure(
                """
                option(env='FOO', help='Foo')
                @depends('FOO')
                def foo(value):
                    if value:
                        return unknown
                    return value
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "global name 'unknown' is not defined")

        # The correct line here is 4, where `unknown` is used, but python
        # disassembly before python 3.13 didn't give us the information.
        line = 4 if sys.version_info >= (3, 13) else 2
        with self.assertRaisesFromLine(NameError, line) as e:
            with self.moz_configure(
                """
                @template
                def tmpl():
                    @depends(unknown)
                    def foo(value):
                        if value:
                            return True
                    return foo
                tmpl()
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "global name 'unknown' is not defined")

    def test_unnecessary_imports(self):
        with self.assertRaisesFromLine(NameError, 3) as e:
            with self.moz_configure(
                """
                option(env='FOO', help='Foo')
                @depends('FOO')
                @imports(_from='__builtin__', _import='list')
                def foo(value):
                    if value:
                        return list()
                    return value
            """
            ):
                self.lint_test()

        self.assertEqual(str(e.exception), "builtin 'list' doesn't need to be imported")

    def test_set_configs(self):
        with self.moz_configure(
            """
            @template
            def foo_config(name):
                set_config(name, True)

            foo_config("FOO")
            set_config("BAR", True)
        """
        ):
            sandbox = self.lint_test()

        self.assertEqual(
            sandbox.set_configs,
            {"BAR": (mozpath.join(test_data_path, "moz.configure"), 7)},
        )

    def test_unreferenced_depends(self):
        with self.moz_configure(
            """
            option("--foo", help="Foo")

            @depends("--foo")
            def unused(foo):
                return foo

            @depends("--foo")
            def check(foo):
                if foo:
                    log.info("foo")

            @depends("--foo")
            def dependency(foo):
                return foo

            @depends(dependency)
            def configured(dependency):
                return dependency

            set_config("FOO", configured)

            @depends("--foo")
            def condition(foo):
                return foo

            set_define("BAR", True, when=condition)

            @depends("--foo")
            def default_baz(foo):
                return bool(foo)

            option("--baz", default=default_baz, help="Baz")

            @depends("--baz")
            def baz(value):
                return value

            set_config("BAZ", baz)

            @template
            def tmpl():
                @depends("--foo")
                def inner(foo):
                    return foo

                return inner

            from_template = tmpl()
        """
        ):
            sandbox = self.lint_test()

        self.assertEqual(
            sandbox.unreferenced_depends(),
            {("unused", mozpath.join(test_data_path, "moz.configure"), 5)},
        )

    def test_unreferenced_depends_checking(self):
        with self.moz_configure(
            """
            option("--foo", help="Foo")

            @template
            def checking(what):
                def decorator(func):
                    def wrapped(*args, **kwargs):
                        ret = func(*args, **kwargs)
                        log.info(ret)
                        return ret

                    return wrapped

                return decorator

            @depends("--foo")
            @checking("for foo")
            def checked(foo):
                return foo

            @depends("--foo")
            def unchecked(foo):
                return foo
        """
        ):
            sandbox = self.lint_test()

        self.assertEqual(
            sandbox.unreferenced_depends(),
            {("unchecked", mozpath.join(test_data_path, "moz.configure"), 22)},
        )

    def test_unreferenced_depends_if_and_lambda(self):
        with self.moz_configure(
            """
            option("--foo", help="Foo")

            @template
            def depends_tmpl(eval_args_fn, *args):
                def decorator(func):
                    @depends(*args)
                    def wrapper(*args):
                        if eval_args_fn(args):
                            return func(*args)

                    return wrapper

                return decorator

            @template
            def depends_if(*args):
                return depends_tmpl(any, *args)

            @depends_if("--foo")
            def unused_if(foo):
                return foo

            @depends_if("--foo")
            def used_if(foo):
                return foo

            set_config("FOO", used_if)

            unused_lambda = depends("--foo")(lambda foo: foo)
            used_lambda = depends("--foo")(lambda foo: foo)
            set_config("BAR", used_lambda)
        """
        ):
            sandbox = self.lint_test()

        path = mozpath.join(test_data_path, "moz.configure")
        self.assertEqual(
            sandbox.unreferenced_depends(),
            {("unused_if", path, 21), ("unused_lambda", path, 30)},
        )

    def test_find_unreferenced_configs(self):
        with MockedOpen({
            mozpath.join(test_data_path, "moz.build"): 'CONFIG["IN_MOZ_BUILD"]',
            mozpath.join(test_data_path, "rules.mk"): "$(IN_MAKE)",
            mozpath.join(test_data_path, "components.conf"): (
                'buildconfig.substs["IN_COMPONENTS"]'
            ),
            mozpath.join(test_data_path, "script"): "IN_SCRIPT",
            mozpath.join(test_data_path, "foo.cpp"): "IN_CPP",
            mozpath.join(test_data_path, "moz.configure"): "IN_CONFIGURE",
            mozpath.join(test_data_path, "bar.py"): "IN_PYTHON_SUFFIX",
            mozpath.join(test_data_path, "baz.py"): "  # IN_COMMENT",
            mozpath.join(test_data_path, "config.h.in"): (
                "#ifdef IN_DEFINE\n#define FOO @IN_SUBST@\n"
            ),
        }):
            self.assertEqual(
                find_unreferenced_configs(
                    (
                        "IN_MOZ_BUILD",
                        "IN_MAKE",
                        "IN_COMPONENTS",
                        "IN_SCRIPT",
                        "IN_CPP",
                        "IN_CONFIGURE",
                        "IN_PYTHON",
                        "IN_COMMENT",
                        "IN_DEFINE",
                        "IN_SUBST",
                    ),
                    test_data_path,
                    [
                        "moz.build",
                        "rules.mk",
                        "components.conf",
                        "script",
                        "foo.cpp",
                        "moz.configure",
                        "bar.py",
                        "baz.py",
                        "config.h.in",
                    ],
                ),
                ["IN_COMMENT", "IN_CONFIGURE", "IN_CPP", "IN_DEFINE", "IN_PYTHON"],
            )


if __name__ == "__main__":
    main()
