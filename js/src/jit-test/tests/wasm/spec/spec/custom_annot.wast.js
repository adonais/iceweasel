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

// ./test/custom/custom/custom_annot.wast

// ./test/custom/custom/custom_annot.wast:1
let $0 = instantiate(`(module
  (type \$t (func))
  (@custom "my-section1" "contents-bytes1")
  (@custom "my-section2" "more-contents-bytes0")
  (@custom "my-section1" "contents-bytes2")
  (@custom "my-section2" (before global) "more-contents-bytes1")
  (@custom "my-section2" (after func) "more-contents-bytes2")
  (@custom "my-section2" (after func) "more-contents-bytes3")
  (@custom "my-section2" (before global) "more-contents-bytes4")
  (func)
  (@custom "my-section2" "more-contents-bytes5")

  (global \$g i32 (i32.const 0))
  (@custom "my-section3")
  (@custom "my-section4" "" "1" "" "2" "3" "")
  (@custom "")
)`);

// ./test/custom/custom/custom_annot.wast:19:8
let $1 = instantiate(`(@custom "bla") `);

// ./test/custom/custom/custom_annot.wast:20:8
let $2 = instantiate(`(module (@custom "bla")) `);

// ./test/custom/custom/custom_annot.wast:25
assert_malformed(() => module(`(@custom) `), `@custom annotation: missing section name`);

// ./test/custom/custom/custom_annot.wast:30
assert_malformed(() => module(`(@custom 4) `), `@custom annotation: missing section name`);

// ./test/custom/custom/custom_annot.wast:35
assert_malformed(
  () => module(`(@custom bla) `),
  `@custom annotation: missing section name`,
);

// ./test/custom/custom/custom_annot.wast:40
assert_malformed(
  () => module(`(@custom "\\df") `),
  `@custom annotation: malformed UTF-8 encoding`,
);

// ./test/custom/custom/custom_annot.wast:48
assert_malformed(
  () => module(`(@custom "bla" here) `),
  `@custom annotation: unexpected token`,
);

// ./test/custom/custom/custom_annot.wast:53
assert_malformed(
  () => module(`(@custom "bla" after) `),
  `@custom annotation: unexpected token`,
);

// ./test/custom/custom/custom_annot.wast:58
assert_malformed(
  () => module(`(@custom "bla" (after)) `),
  `@custom annotation: malformed section kind`,
);

// ./test/custom/custom/custom_annot.wast:63
assert_malformed(
  () => module(`(@custom "bla" (type)) `),
  `@custom annotation: malformed placement`,
);

// ./test/custom/custom/custom_annot.wast:68
assert_malformed(
  () => module(`(@custom "bla" (aft type)) `),
  `@custom annotation: malformed placement`,
);

// ./test/custom/custom/custom_annot.wast:73
assert_malformed(
  () => module(`(@custom "bla" (before types)) `),
  `@custom annotation: malformed section kind`,
);

// ./test/custom/custom/custom_annot.wast:81
assert_malformed(
  () => module(`(type (@custom "bla") \$t (func)) `),
  `misplaced @custom annotation`,
);

// ./test/custom/custom/custom_annot.wast:86
assert_malformed(() => module(`(func (@custom "bla")) `), `misplaced @custom annotation`);

// ./test/custom/custom/custom_annot.wast:91
assert_malformed(
  () => module(`(func (block (@custom "bla"))) `),
  `misplaced @custom annotation`,
);

// ./test/custom/custom/custom_annot.wast:96
assert_malformed(
  () => module(`(func (nop (@custom "bla"))) `),
  `misplaced @custom annotation`,
);
