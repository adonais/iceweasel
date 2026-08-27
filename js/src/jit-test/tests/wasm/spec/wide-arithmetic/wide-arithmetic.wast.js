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

// ./test/core/wide-arithmetic.wast

// ./test/core/wide-arithmetic.wast:1
let $0 = instantiate(`(module
  (func (export "i64.add128") (param i64 i64 i64 i64) (result i64 i64)
    local.get 0
    local.get 1
    local.get 2
    local.get 3
    i64.add128)
  (func (export "i64.sub128") (param i64 i64 i64 i64) (result i64 i64)
    local.get 0
    local.get 1
    local.get 2
    local.get 3
    i64.sub128)
  (func (export "i64.mul_wide_s") (param i64 i64) (result i64 i64)
    local.get 0
    local.get 1
    i64.mul_wide_s)
  (func (export "i64.mul_wide_u") (param i64 i64) (result i64 i64)
    local.get 0
    local.get 1
    i64.mul_wide_u)
)`);

// ./test/core/wide-arithmetic.wast:25
assert_return(() => invoke($0, `i64.add128`, [0n, 0n, 0n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:29
assert_return(() => invoke($0, `i64.add128`, [0n, 1n, 1n, 0n]), [value("i64", 1n), value("i64", 1n)]);

// ./test/core/wide-arithmetic.wast:33
assert_return(() => invoke($0, `i64.add128`, [1n, 0n, -1n, 0n]), [value("i64", 0n), value("i64", 1n)]);

// ./test/core/wide-arithmetic.wast:37
assert_return(() => invoke($0, `i64.add128`, [1n, 1n, -1n, -1n]), [value("i64", 0n), value("i64", 1n)]);

// ./test/core/wide-arithmetic.wast:43
assert_return(() => invoke($0, `i64.sub128`, [0n, 0n, 0n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:47
assert_return(() => invoke($0, `i64.sub128`, [0n, 0n, 1n, 0n]), [value("i64", -1n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:51
assert_return(() => invoke($0, `i64.sub128`, [0n, 1n, 1n, 1n]), [value("i64", -1n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:55
assert_return(() => invoke($0, `i64.sub128`, [0n, 0n, 1n, 1n]), [value("i64", -1n), value("i64", -2n)]);

// ./test/core/wide-arithmetic.wast:61
assert_return(() => invoke($0, `i64.mul_wide_s`, [0n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:63
assert_return(() => invoke($0, `i64.mul_wide_u`, [0n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:65
assert_return(() => invoke($0, `i64.mul_wide_s`, [1n, 1n]), [value("i64", 1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:67
assert_return(() => invoke($0, `i64.mul_wide_u`, [1n, 1n]), [value("i64", 1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:69
assert_return(() => invoke($0, `i64.mul_wide_s`, [-1n, -1n]), [value("i64", 1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:71
assert_return(() => invoke($0, `i64.mul_wide_s`, [-1n, 1n]), [value("i64", -1n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:73
assert_return(() => invoke($0, `i64.mul_wide_u`, [-1n, 1n]), [value("i64", -1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:77
assert_return(
  () => invoke($0, `i64.add128`, [-2418420703207364752n, -1n, -1n, -1n]),
  [value("i64", -2418420703207364753n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:81
assert_return(
  () => invoke($0, `i64.add128`, [0n, 0n, -4579433644172935106n, -1n]),
  [value("i64", -4579433644172935106n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:85
assert_return(() => invoke($0, `i64.add128`, [0n, 0n, 1n, -1n]), [value("i64", 1n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:89
assert_return(() => invoke($0, `i64.add128`, [1n, 0n, 1n, 0n]), [value("i64", 2n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:93
assert_return(
  () => invoke($0, `i64.add128`, [-1n, -1n, -1n, -1n]),
  [value("i64", -2n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:97
assert_return(() => invoke($0, `i64.add128`, [0n, -1n, 1n, 0n]), [value("i64", 1n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:101
assert_return(() => invoke($0, `i64.add128`, [0n, 0n, 0n, -1n]), [value("i64", 0n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:105
assert_return(() => invoke($0, `i64.add128`, [1n, 0n, -1n, -1n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:109
assert_return(
  () => invoke($0, `i64.add128`, [0n, 6184727276166606191n, 0n, 1n]),
  [value("i64", 0n), value("i64", 6184727276166606192n)],
);

// ./test/core/wide-arithmetic.wast:113
assert_return(
  () => invoke($0, `i64.add128`, [-8434911321912688222n, -1n, 1n, -1n]),
  [value("i64", -8434911321912688221n), value("i64", -2n)],
);

// ./test/core/wide-arithmetic.wast:117
assert_return(() => invoke($0, `i64.add128`, [1n, -1n, 0n, -1n]), [value("i64", 1n), value("i64", -2n)]);

// ./test/core/wide-arithmetic.wast:121
assert_return(
  () => invoke($0, `i64.add128`, [1n, -5148941131328838092n, 0n, 0n]),
  [value("i64", 1n), value("i64", -5148941131328838092n)],
);

// ./test/core/wide-arithmetic.wast:125
assert_return(() => invoke($0, `i64.add128`, [1n, 1n, 1n, 0n]), [value("i64", 2n), value("i64", 1n)]);

// ./test/core/wide-arithmetic.wast:129
assert_return(
  () => invoke($0, `i64.add128`, [-1n, -1n, -3636740005180858631n, -1n]),
  [value("i64", -3636740005180858632n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:133
assert_return(
  () => invoke($0, `i64.add128`, [-5529682780229988275n, -1n, 0n, 0n]),
  [value("i64", -5529682780229988275n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:137
assert_return(
  () => invoke($0, `i64.add128`, [1n, -5381447440966559717n, 1020031372481336745n, 1n]),
  [value("i64", 1020031372481336746n), value("i64", -5381447440966559716n)],
);

// ./test/core/wide-arithmetic.wast:141
assert_return(() => invoke($0, `i64.add128`, [1n, 1n, 0n, 0n]), [value("i64", 1n), value("i64", 1n)]);

// ./test/core/wide-arithmetic.wast:145
assert_return(
  () => invoke($0, `i64.add128`, [-9133888546939907356n, -1n, 1n, 1n]),
  [value("i64", -9133888546939907355n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:149
assert_return(
  () => invoke($0, `i64.add128`, [-4612047512704241719n, -1n, 0n, -1n]),
  [value("i64", -4612047512704241719n), value("i64", -2n)],
);

// ./test/core/wide-arithmetic.wast:153
assert_return(
  () => invoke($0, `i64.add128`, [414720966820876428n, -1n, 1n, 0n]),
  [value("i64", 414720966820876429n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:160
assert_return(
  () => invoke($0, `i64.sub128`, [
    0n,
    -2459085471354756766n,
    -9151153060221070927n,
    -1n,
  ]),
  [value("i64", 9151153060221070927n), value("i64", -2459085471354756766n)],
);

// ./test/core/wide-arithmetic.wast:164
assert_return(
  () => invoke($0, `i64.sub128`, [
    4566502638724063423n,
    -4282658540409485563n,
    -6884077310018979971n,
    -1n,
  ]),
  [value("i64", -6996164124966508222n), value("i64", -4282658540409485563n)],
);

// ./test/core/wide-arithmetic.wast:168
assert_return(
  () => invoke($0, `i64.sub128`, [1n, 3118380319444903041n, 0n, 3283115686417695443n]),
  [value("i64", 1n), value("i64", -164735366972792402n)],
);

// ./test/core/wide-arithmetic.wast:172
assert_return(
  () => invoke($0, `i64.sub128`, [-7208415241680161810n, -1n, 1n, 0n]),
  [value("i64", -7208415241680161811n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:176
assert_return(
  () => invoke($0, `i64.sub128`, [0n, 3944850126731328706n, 1n, 1n]),
  [value("i64", -1n), value("i64", 3944850126731328704n)],
);

// ./test/core/wide-arithmetic.wast:180
assert_return(
  () => invoke($0, `i64.sub128`, [1n, -1n, -1n, -1n]),
  [value("i64", 2n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:184
assert_return(
  () => invoke($0, `i64.sub128`, [
    -1n,
    -1n,
    4855833073346115923n,
    -6826437637438999645n,
  ]),
  [value("i64", -4855833073346115924n), value("i64", 6826437637438999644n)],
);

// ./test/core/wide-arithmetic.wast:188
assert_return(() => invoke($0, `i64.sub128`, [1n, 0n, -1n, -1n]), [value("i64", 2n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:192
assert_return(() => invoke($0, `i64.sub128`, [1n, 0n, 1n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:196
assert_return(
  () => invoke($0, `i64.sub128`, [-1n, -1n, 0n, 0n]),
  [value("i64", -1n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:200
assert_return(
  () => invoke($0, `i64.sub128`, [1n, -1n, -6365475388498096428n, -1n]),
  [value("i64", 6365475388498096429n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:204
assert_return(
  () => invoke($0, `i64.sub128`, [6804238617560992346n, -1n, 0n, -1n]),
  [value("i64", 6804238617560992346n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:208
assert_return(
  () => invoke($0, `i64.sub128`, [0n, 1n, 1n, -7756145513466453619n]),
  [value("i64", -1n), value("i64", 7756145513466453619n)],
);

// ./test/core/wide-arithmetic.wast:212
assert_return(() => invoke($0, `i64.sub128`, [1n, -1n, 1n, 1n]), [value("i64", 0n), value("i64", -2n)]);

// ./test/core/wide-arithmetic.wast:216
assert_return(() => invoke($0, `i64.sub128`, [0n, 1n, 1n, 0n]), [value("i64", -1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:220
assert_return(
  () => invoke($0, `i64.sub128`, [1n, 5602881641763648953n, -2110589244314239080n, -1n]),
  [value("i64", 2110589244314239081n), value("i64", 5602881641763648953n)],
);

// ./test/core/wide-arithmetic.wast:224
assert_return(() => invoke($0, `i64.sub128`, [0n, 1n, -1n, -1n]), [value("i64", 1n), value("i64", 1n)]);

// ./test/core/wide-arithmetic.wast:228
assert_return(
  () => invoke($0, `i64.sub128`, [0n, -1n, 3553816990259121806n, -2105235417856431622n]),
  [value("i64", -3553816990259121806n), value("i64", 2105235417856431620n)],
);

// ./test/core/wide-arithmetic.wast:232
assert_return(
  () => invoke($0, `i64.sub128`, [1861102705894987245n, 1n, 3713781778534059871n, 1n]),
  [value("i64", -1852679072639072626n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:236
assert_return(
  () => invoke($0, `i64.sub128`, [0n, -1n, 1n, 1832524486821761762n]),
  [value("i64", -1n), value("i64", -1832524486821761764n)],
);

// ./test/core/wide-arithmetic.wast:242
assert_return(() => invoke($0, `i64.mul_wide_s`, [1n, 1n]), [value("i64", 1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:244
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [0n, 6287758211025156705n]),
  [value("i64", 0n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:246
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [-6643537319803451357n, 1n]),
  [value("i64", -6643537319803451357n), value("i64", -1n)],
);

// ./test/core/wide-arithmetic.wast:248
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [-2483565146858803428n, 0n]),
  [value("i64", 0n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:250
assert_return(() => invoke($0, `i64.mul_wide_s`, [1n, 1n]), [value("i64", 1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:252
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [-3838951433439430085n, 3471602925362676030n]),
  [value("i64", 5186941893001237834n), value("i64", -722475195264825124n)],
);

// ./test/core/wide-arithmetic.wast:254
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [-8262495286814853129n, 7883241869666573970n]),
  [value("i64", -8557189786755031842n), value("i64", -3530988912334554469n)],
);

// ./test/core/wide-arithmetic.wast:256
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [4278371902407959701n, 1n]),
  [value("i64", 4278371902407959701n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:258
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [-8852706149487089182n, -1n]),
  [value("i64", 8852706149487089182n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:260
assert_return(() => invoke($0, `i64.mul_wide_s`, [1n, -1n]), [value("i64", -1n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:262
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [-1n, -4329244561838653387n]),
  [value("i64", 4329244561838653387n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:264
assert_return(() => invoke($0, `i64.mul_wide_s`, [-1n, -1n]), [value("i64", 1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:266
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [697896157315764057n, 1n]),
  [value("i64", 697896157315764057n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:268
assert_return(() => invoke($0, `i64.mul_wide_s`, [1n, 1n]), [value("i64", 1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:270
assert_return(() => invoke($0, `i64.mul_wide_s`, [-1n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:272
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [0n, -3769664482072947073n]),
  [value("i64", 0n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:274
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [1n, 8414291037346403854n]),
  [value("i64", 8414291037346403854n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:276
assert_return(() => invoke($0, `i64.mul_wide_s`, [1n, -1n]), [value("i64", -1n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:278
assert_return(
  () => invoke($0, `i64.mul_wide_s`, [5014655679779318485n, -5080037812563681985n]),
  [value("i64", 2842857627777395563n), value("i64", -1380983027057486843n)],
);

// ./test/core/wide-arithmetic.wast:280
assert_return(() => invoke($0, `i64.mul_wide_s`, [0n, 1n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:284
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [-4734436040338162711n, 0n]),
  [value("i64", 0n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:286
assert_return(() => invoke($0, `i64.mul_wide_u`, [1n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:288
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [3270597527173764279n, 6636648075495406358n]),
  [value("i64", -5430303818902260550n), value("i64", 1176674035141685826n)],
);

// ./test/core/wide-arithmetic.wast:290
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [-7771814344630108151n, 1n]),
  [value("i64", -7771814344630108151n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:292
assert_return(() => invoke($0, `i64.mul_wide_u`, [1n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:294
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [1n, -7864138787704962081n]),
  [value("i64", -7864138787704962081n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:296
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [1n, 518555141550256010n]),
  [value("i64", 518555141550256010n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:298
assert_return(() => invoke($0, `i64.mul_wide_u`, [1n, -1n]), [value("i64", -1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:300
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [1118900477321231571n, -1n]),
  [value("i64", -1118900477321231571n), value("i64", 1118900477321231570n)],
);

// ./test/core/wide-arithmetic.wast:302
assert_return(() => invoke($0, `i64.mul_wide_u`, [-1n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:304
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [-5586890671027490027n, 1n]),
  [value("i64", -5586890671027490027n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:306
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [0n, 3603850799751152505n]),
  [value("i64", 0n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:308
assert_return(() => invoke($0, `i64.mul_wide_u`, [-1n, -1n]), [value("i64", 1n), value("i64", -2n)]);

// ./test/core/wide-arithmetic.wast:310
assert_return(() => invoke($0, `i64.mul_wide_u`, [0n, 1n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:312
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [-7344082851774441644n, 3896439839137544024n]),
  [value("i64", 5738542512914895072n), value("i64", 2345175459296971666n)],
);

// ./test/core/wide-arithmetic.wast:314
assert_return(() => invoke($0, `i64.mul_wide_u`, [0n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:316
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [616395976148874061n, 0n]),
  [value("i64", 0n), value("i64", 0n)],
);

// ./test/core/wide-arithmetic.wast:318
assert_return(
  () => invoke($0, `i64.mul_wide_u`, [2810729703362889816n, -1n]),
  [value("i64", -2810729703362889816n), value("i64", 2810729703362889815n)],
);

// ./test/core/wide-arithmetic.wast:320
assert_return(() => invoke($0, `i64.mul_wide_u`, [1n, -1n]), [value("i64", -1n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:322
assert_return(() => invoke($0, `i64.mul_wide_u`, [1n, 0n]), [value("i64", 0n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:326
let $1 = instantiate(`(module binary
  "\\00asm" "\\01\\00\\00\\00"

  "\\01\\11"                  ;; type section, 17 bytes
  "\\02"                     ;; 2 count
  "\\60"                     ;; type0 = function
  "\\04\\7e\\7e\\7e\\7e"         ;;  4 params - all i64
  "\\02\\7e\\7e"               ;;  2 results - both i64
  "\\60"                     ;; type1 = function
  "\\02\\7e\\7e"               ;;  2 params - both i64
  "\\02\\7e\\7e"               ;;  2 results - both i64

  "\\03\\05"                  ;; function section, 5 byte
  "\\04"                     ;; 4 count
  "\\00\\00\\01\\01"            ;; types of each function (0, 0, 1, 1)

  "\\07\\3d"                  ;; export section 0x3d bytes
  "\\04"                     ;; 4 count
  "\\0ai64.add128\\00\\00"     ;; "i64.add128" which is function 0
  "\\0ai64.sub128\\00\\01"     ;; "i64.add128" which is function 1
  "\\0ei64.mul_wide_s\\00\\02" ;; "i64.mul_wide_s" which is function 2
  "\\0ei64.mul_wide_u\\00\\03" ;; "i64.mul_wide_s" which is function 3

  "\\0a\\37"                  ;; code section + byte length
  "\\04"                     ;; 4 count

  "\\0e"                     ;; byte length
  "\\00"                     ;; no locals
  "\\20\\00"                  ;; local.get 0
  "\\20\\01"                  ;; local.get 1
  "\\20\\02"                  ;; local.get 2
  "\\20\\03"                  ;; local.get 3
  "\\fc\\93\\80\\00"            ;; i64.add128 (overlong)
  "\\0b"                     ;; end

  "\\0d"                     ;; byte length
  "\\00"                     ;; no locals
  "\\20\\00"                  ;; local.get 0
  "\\20\\01"                  ;; local.get 1
  "\\20\\02"                  ;; local.get 2
  "\\20\\03"                  ;; local.get 3
  "\\fc\\94\\00"               ;; i64.sub128 (overlong)
  "\\0b"                     ;; end

  "\\0c"                     ;; byte length
  "\\00"                     ;; no locals
  "\\20\\00"                  ;; local.get 0
  "\\20\\01"                  ;; local.get 1
  "\\fc\\95\\80\\80\\80\\00"      ;; i64.mul_wide_s (overlong)
  "\\0b"                     ;; end

  "\\0b"                     ;; byte length
  "\\00"                     ;; no locals
  "\\20\\00"                  ;; local.get 0
  "\\20\\01"                  ;; local.get 1
  "\\fc\\96\\80\\80\\00"         ;; i64.mul_wide_u (overlong)
  "\\0b"                     ;; end
)`);

// ./test/core/wide-arithmetic.wast:385
assert_return(() => invoke($1, `i64.add128`, [1n, 2n, 3n, 4n]), [value("i64", 4n), value("i64", 6n)]);

// ./test/core/wide-arithmetic.wast:389
assert_return(() => invoke($1, `i64.sub128`, [2n, 5n, 1n, 2n]), [value("i64", 1n), value("i64", 3n)]);

// ./test/core/wide-arithmetic.wast:393
assert_return(() => invoke($1, `i64.mul_wide_s`, [1n, -2n]), [value("i64", -2n), value("i64", -1n)]);

// ./test/core/wide-arithmetic.wast:395
assert_return(() => invoke($1, `i64.mul_wide_u`, [3n, 2n]), [value("i64", 6n), value("i64", 0n)]);

// ./test/core/wide-arithmetic.wast:400
assert_invalid(
  () => instantiate(`(module
    (func (param i64 i64 i64 i64) (result i64)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      i64.add128)
  )`),
  `type mismatch`,
);

// ./test/core/wide-arithmetic.wast:410
assert_invalid(
  () => instantiate(`(module
    (func (param i64 i64 i64) (result i64 i64)
      local.get 0
      local.get 1
      local.get 2
      i64.add128)
  )`),
  `type mismatch`,
);

// ./test/core/wide-arithmetic.wast:420
assert_invalid(
  () => instantiate(`(module
    (func (param i64 i64 i64 i64) (result i64)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      i64.sub128)
  )`),
  `type mismatch`,
);

// ./test/core/wide-arithmetic.wast:430
assert_invalid(
  () => instantiate(`(module
    (func (param i64 i64 i64) (result i64 i64)
      local.get 0
      local.get 1
      local.get 2
      i64.sub128)
  )`),
  `type mismatch`,
);

// ./test/core/wide-arithmetic.wast:440
assert_invalid(
  () => instantiate(`(module
    (func (param i64 i64) (result i64)
      local.get 0
      local.get 1
      i64.mul_wide_s)
  )`),
  `type mismatch`,
);

// ./test/core/wide-arithmetic.wast:448
assert_invalid(
  () => instantiate(`(module
    (func (param i64) (result i64 i64)
      local.get 0
      i64.mul_wide_s)
  )`),
  `type mismatch`,
);

// ./test/core/wide-arithmetic.wast:456
assert_invalid(
  () => instantiate(`(module
    (func (param i64 i64) (result i64)
      local.get 0
      local.get 1
      i64.mul_wide_u)
  )`),
  `type mismatch`,
);

// ./test/core/wide-arithmetic.wast:464
assert_invalid(
  () => instantiate(`(module
    (func (param i64) (result i64 i64)
      local.get 0
      i64.mul_wide_u)
  )`),
  `type mismatch`,
);
