/* Copyright 2021 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// ./test/custom/name/name.wast

// ./test/custom/name/name.wast:2
let $0 = instantiate(`(module (;(@name "M");) (@custom "name" (after data) "\\00\\02\\01M"))`);

// ./test/custom/name/name.wast:5
let $1 = instantiate(`(module
  (func (;(@name "f");))
  (func (;(@name "g");))
  (@custom "name" (after data) "\\01\\07\\02\\00\\01f\\01\\01g")
)`);

// ./test/custom/name/name.wast:12
let $2 = instantiate(`(module
  (func (param (;(@name "p");) i32) (local (;(@name "l");) i64))
  (@custom "name" (after data) "\\02\\09\\01\\00\\02\\00\\01p\\01\\01l")
)`);

// ./test/custom/name/name.wast:18
let $3 = instantiate(`(module
  (func
    block (;(@name "a");) end
    loop (;(@name "b");) end
  )
  (@custom "name" (after data) "\\03\\09\\01\\00\\02\\00\\01a\\01\\01b")
)`);

// ./test/custom/name/name.wast:27
let $4 = instantiate(`(module
  (type (;(@name "T");) (func))
  (@custom "name" (after data) "\\04\\04\\01\\00\\01T")
)`);

// ./test/custom/name/name.wast:33
let $5 = instantiate(`(module
  (table (;(@name "t");) 1 funcref)
  (@custom "name" (after data) "\\05\\04\\01\\00\\01t")
)`);

// ./test/custom/name/name.wast:39
let $6 = instantiate(`(module
  (memory (;(@name "m");) 1)
  (@custom "name" (after data) "\\06\\04\\01\\00\\01m")
)`);

// ./test/custom/name/name.wast:45
let $7 = instantiate(`(module
  (global (;(@name "g");) i32 (i32.const 0))
  (@custom "name" (after data) "\\07\\04\\01\\00\\01g")
)`);

// ./test/custom/name/name.wast:51
let $8 = instantiate(`(module
  (func \$f)
  (table 1 funcref)
  (elem (;(@name "e");) (i32.const 0) func \$f)
  (@custom "name" (after data) "\\08\\04\\01\\00\\01e")
)`);

// ./test/custom/name/name.wast:59
let $9 = instantiate(`(module
  (memory 1)
  (data (;(@name "d");) (i32.const 0) "x")
  (@custom "name" (after data) "\\09\\04\\01\\00\\01d")
)`);

// ./test/custom/name/name.wast:66
let $10 = instantiate(`(module
  (type (struct (field (;(@name "f");) i32)))
  (@custom "name" (after data) "\\0a\\06\\01\\00\\01\\00\\01f")
)`);

// ./test/custom/name/name.wast:72
let $11 = instantiate(`(module
  (type \$t (func))
  (tag (;(@name "x");) (type \$t))
  (@custom "name" (after data) "\\0b\\04\\01\\00\\01x")
)`);

// ./test/custom/name/name.wast:79
let $12 = instantiate(`(module
  (type (func (param (;(@name "x");) i32)))
  (@custom "name" (after data) "\\0c\\06\\01\\00\\01\\00\\01x")
)`);

// ./test/custom/name/name.wast:85
let $13 = instantiate(`(module
  (type \$t (func (param i32)))
  (tag (type \$t) (param (;(@name "c");) i32))
  (@custom "name" (after data) "\\0d\\06\\01\\00\\01\\00\\01c")
)`);

// ./test/custom/name/name.wast:94
let $14 = instantiate(`(module
  (type (struct (field i32)))          ;; type 0
  (type \$ft (func (param i32)))        ;; type 1
  (func (local i32) block end)         ;; func 0, local 0, label 0
  (table 1 funcref)
  (memory 1)
  (global i32 (i32.const 0))
  (elem (i32.const 0) func 0)
  (data (i32.const 0) "x")
  (tag (type \$ft))
  (@custom "name" (after data)
    "\\00\\02\\01M"                       ;; 0  module name
    "\\01\\04\\01\\00\\01f"                 ;; 1  function names
    "\\02\\06\\01\\00\\01\\00\\01l"           ;; 2  local names
    "\\03\\06\\01\\00\\01\\00\\01a"           ;; 3  label names
    "\\04\\09\\02\\00\\02T0\\01\\02T1"        ;; 4  type names
    "\\05\\04\\01\\00\\01t"                 ;; 5  table names
    "\\06\\04\\01\\00\\01m"                 ;; 6  memory names
    "\\07\\04\\01\\00\\01g"                 ;; 7  global names
    "\\08\\04\\01\\00\\01e"                 ;; 8  element segment names
    "\\09\\04\\01\\00\\01d"                 ;; 9  data segment names
    "\\0a\\08\\01\\00\\01\\00\\03fld"         ;; 10 field names
    "\\0b\\06\\01\\00\\03tag"               ;; 11 tag names
    "\\0c\\06\\01\\01\\01\\00\\01x"           ;; 12 parameter names
    "\\0d\\06\\01\\00\\01\\00\\01c"           ;; 13 tag parameter names
  )
)`);

// ./test/custom/name/name.wast:126
let $15 = instantiate(`(module (@custom "name" (after data) "\\01\\01\\00"))`);

// ./test/custom/name/name.wast:129
let $16 = instantiate(`(module (func) (@custom "name" (after data) "\\02\\03\\01\\00\\00"))`);

// ./test/custom/name/name.wast:132
let $17 = instantiate(`(module (func) (@custom "name" (after data) "\\01\\03\\01\\00\\00"))`);

// ./test/custom/name/name.wast:135
let $18 = instantiate(`(module (func) (func) (@custom "name" (after data) "\\01\\07\\02\\00\\01a\\01\\01a"))`);

// ./test/custom/name/name.wast:141
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\04\\01\\00\\01f\\00\\02\\01M")) `),
  `invalid name subsection id`,
);

// ./test/custom/name/name.wast:150
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data)     "\\01\\04\\01\\00\\01f\\01\\04\\01\\00\\01g")) `),
  `invalid name subsection id`,
);

// ./test/custom/name/name.wast:160
assert_malformed_custom(
  () => module(`(module (@custom "name" (after data) "\\ff\\04\\01\\00\\01x")) `),
  `invalid name subsection id`,
);

// ./test/custom/name/name.wast:168
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\04\\01\\00\\01f\\ff")) `),
  `invalid name subsection id`,
);

// ./test/custom/name/name.wast:177
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\04\\01\\00\\03f")) `),
  `unexpected end of name subsection`,
);

// ./test/custom/name/name.wast:184
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data)     "\\01\\04\\01\\00\\03f\\00\\02\\01M")) `),
  `unexpected end of name subsection`,
);

// ./test/custom/name/name.wast:194
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\02\\01\\00\\01f")) `),
  `unexpected end of name subsection`,
);

// ./test/custom/name/name.wast:203
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\04\\02\\00\\01f")) `),
  `unexpected end of name subsection`,
);

// ./test/custom/name/name.wast:212
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\09\\01\\00\\01f")) `),
  `unexpected end of name section`,
);

// ./test/custom/name/name.wast:221
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\05\\01\\00\\01f\\ff")) `),
  `name subsection size mismatch`,
);

// ./test/custom/name/name.wast:230
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\04\\01\\00\\01\\ff")) `),
  `malformed UTF-8 encoding`,
);

// ./test/custom/name/name.wast:242
assert_malformed_custom(
  () => module(`(module (func)   (@custom "name" (after data) "\\01\\07\\02\\00\\01a\\00\\01b")) `),
  `custom @name: duplicate function name`,
);

// ./test/custom/name/name.wast:251
assert_malformed_custom(
  () => module(`(module (func) (func)   (@custom "name" (after data) "\\01\\07\\02\\01\\01b\\00\\01a")) `),
  `custom @name: function names out of order`,
);

// ./test/custom/name/name.wast:260
assert_malformed_custom(
  () => module(`(module (func (local i32))   (@custom "name" (after data)     "\\02\\0b\\02\\00\\01\\00\\01a\\00\\01\\00\\01b")) `),
  `custom @name: duplicate local name map`,
);

// ./test/custom/name/name.wast:270
assert_malformed_custom(
  () => module(`(module (func (local i32)) (func (local i32))   (@custom "name" (after data)     "\\02\\0b\\02\\01\\01\\00\\01b\\00\\01\\00\\01a")) `),
  `custom @name: local name maps out of order`,
);

// ./test/custom/name/name.wast:280
assert_malformed_custom(
  () => module(`(module (func (local i32))   (@custom "name" (after data)     "\\02\\09\\01\\00\\02\\00\\01a\\00\\01b")) `),
  `custom @name: duplicate local name`,
);

// ./test/custom/name/name.wast:290
assert_malformed_custom(
  () => module(`(module (func (local i32) (local i64))   (@custom "name" (after data)     "\\02\\09\\01\\00\\02\\01\\01b\\00\\01a")) `),
  `custom @name: local names out of order`,
);

// ./test/custom/name/name.wast:302
let _anon_301 = module(`(module
  (import "m" "f" (func))
  (func)
  (@custom "name" (after data) "\\01\\04\\01\\01\\01f")   ;; function 1 = "f"
)`);

// ./test/custom/name/name.wast:308
let _anon_307 = module(`(module
  (import "m" "t" (table 1 funcref))
  (table 1 funcref)
  (@custom "name" (after data) "\\05\\04\\01\\01\\01t")   ;; table 1 = "t"
)`);

// ./test/custom/name/name.wast:314
let _anon_313 = module(`(module
  (import "m" "m" (memory 1))
  (memory 1)
  (@custom "name" (after data) "\\06\\04\\01\\01\\01m")   ;; memory 1 = "m"
)`);

// ./test/custom/name/name.wast:320
let _anon_319 = module(`(module
  (import "m" "g" (global i32))
  (global i32 (i32.const 0))
  (@custom "name" (after data) "\\07\\04\\01\\01\\01g")   ;; global 1 = "g"
)`);

// ./test/custom/name/name.wast:326
let _anon_325 = module(`(module
  (type \$t (func))
  (import "m" "e" (tag (type \$t)))
  (tag (type \$t))
  (@custom "name" (after data) "\\0b\\04\\01\\01\\01t")   ;; tag 1 = "t"
)`);

// ./test/custom/name/name.wast:344
let _anon_343 = module(`(module
  (type \$t (func (param i32)))
  (import "m" "f" (func (type \$t)))
  (func (type \$t))
  (@custom "name" (after data)
    "\\02\\0b\\02\\00\\01\\00\\01p\\01\\01\\00\\01q"            ;; params of functions 0 and 1
  )
)`);

// Several spec tests have been omitted because we don't actually care if the
// provided indices refer to valid items. In many cases this is all but
// impossible for us to know at the time we parse the name section, e.g. the
// number of locals or labels in a function body. See spec-tests.patch.
