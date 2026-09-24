/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const TESTS = [
  // SVG without an intrinsic size and viewBox
  //
  // The image doesn't have an intrinsic size, so a desired size must be
  // specified. It also doesn't have an intrinsic aspect ratio, so the final
  // size will always be stretched to the desired size.
  {
    basename: "intrinsic_size_none.svg",
    cases: [
      {
        params: {},
        expected: {
          error: true,
        },
      },
      {
        params: {
          width: 0,
          height: 0,
        },
        expected: {
          error: true,
        },
      },
      {
        params: {
          width: 0,
          height: 12,
        },
        expected: {
          error: true,
        },
      },
      {
        params: {
          width: 12,
          height: 0,
        },
        expected: {
          error: true,
        },
      },
      {
        params: {
          width: 12,
          height: 34,
        },
        expected: {
          width: 12,
          height: 34,
        },
      },
    ],
  },

  // SVG without an intrinsic size but with a 200x100 viewBox
  //
  // The image doesn't have an intrinsic size, so a desired size must be
  // specified. It does have an aspect ratio, so the final size will preserve it
  // unless `stretch` is specified.
  {
    basename: "intrinsic_size_none_viewBox_3000x100.svg",
    cases: [
      // no desired size
      {
        params: {},
        expected: {
          error: true,
        },
      },
      {
        params: {
          width: 0,
          height: 0,
        },
        expected: {
          error: true,
        },
      },
      {
        params: {
          width: 0,
          height: 12,
        },
        expected: {
          error: true,
        },
      },
      {
        params: {
          width: 12,
          height: 0,
        },
        expected: {
          error: true,
        },
      },

      // desired size same as viewBox
      {
        params: {
          width: 3000,
          height: 100,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },

      // desired sizes larger than viewBox in both dimensions
      {
        params: {
          width: 5000,
          height: 5000,
        },
        expected: {
          width: 5000,
          height: 167,
        },
      },
      {
        params: {
          width: 3001,
          height: 101,
        },
        expected: {
          width: 3001,
          height: 101,
        },
      },
      {
        params: {
          width: 3001,
          height: 3002,
        },
        expected: {
          width: 3001,
          height: 101,
        },
      },

      // desired sizes smaller than viewBox in both dimensions
      {
        params: {
          width: 2999,
          height: 99,
        },
        expected: {
          width: 2970,
          height: 99,
        },
      },
      {
        params: {
          width: 2999,
          height: 10,
        },
        expected: {
          width: 300,
          height: 10,
        },
      },
      {
        params: {
          width: 100,
          height: 99,
        },
        expected: {
          width: 100,
          height: 4,
        },
      },
      {
        params: {
          width: 10,
          height: 99,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },
      {
        params: {
          width: 10,
          height: 10,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },

      // desired sizes larger in one dimension, smaller in the other
      {
        params: {
          width: 5000,
          height: 99,
        },
        expected: {
          width: 2970,
          height: 99,
        },
      },
      {
        params: {
          width: 5000,
          height: 10,
        },
        expected: {
          width: 300,
          height: 10,
        },
      },
      {
        params: {
          width: 3001,
          height: 99,
        },
        expected: {
          width: 2970,
          height: 99,
        },
      },
      {
        params: {
          width: 3001,
          height: 10,
        },
        expected: {
          width: 300,
          height: 10,
        },
      },
      {
        params: {
          width: 2999,
          height: 500,
        },
        expected: {
          width: 2999,
          height: 100,
        },
      },
      {
        params: {
          width: 2999,
          height: 101,
        },
        expected: {
          width: 2999,
          height: 100,
        },
      },
      {
        params: {
          width: 100,
          height: 500,
        },
        expected: {
          width: 100,
          height: 4,
        },
      },
      {
        params: {
          width: 100,
          height: 101,
        },
        expected: {
          width: 100,
          height: 4,
        },
      },
      {
        params: {
          width: 10,
          height: 500,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },
      {
        params: {
          width: 10,
          height: 101,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },
    ],
  },

  // SVG with intrinsic size: 3000x100
  {
    basename: "intrinsic_size_3000x100.svg",
    cases: [
      // no desired size
      {
        params: {},
        expected: {
          width: 3000,
          height: 100,
        },
      },
      {
        params: {
          width: 0,
          height: 0,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },
      {
        params: {
          width: 0,
          height: 12,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },
      {
        params: {
          width: 12,
          height: 0,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },

      // desired size same as intrinsic
      {
        params: {
          width: 3000,
          height: 100,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },

      // desired sizes larger than intrinsic in both dimensions
      {
        params: {
          width: 5000,
          height: 5000,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },
      {
        params: {
          width: 3001,
          height: 101,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },
      {
        params: {
          width: 3001,
          height: 3002,
        },
        expected: {
          width: 3000,
          height: 100,
        },
      },

      // desired sizes smaller than intrinsic in both dimensions
      {
        params: {
          width: 2999,
          height: 99,
        },
        expected: {
          width: 2970,
          height: 99,
        },
      },
      {
        params: {
          width: 2999,
          height: 10,
        },
        expected: {
          width: 300,
          height: 10,
        },
      },
      {
        params: {
          width: 100,
          height: 99,
        },
        expected: {
          width: 100,
          height: 4,
        },
      },
      {
        params: {
          width: 10,
          height: 99,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },
      {
        params: {
          width: 10,
          height: 10,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },

      // desired sizes larger in one dimension, smaller in the other
      {
        params: {
          width: 5000,
          height: 99,
        },
        expected: {
          width: 2970,
          height: 99,
        },
      },
      {
        params: {
          width: 5000,
          height: 10,
        },
        expected: {
          width: 300,
          height: 10,
        },
      },
      {
        params: {
          width: 3001,
          height: 99,
        },
        expected: {
          width: 2970,
          height: 99,
        },
      },
      {
        params: {
          width: 3001,
          height: 10,
        },
        expected: {
          width: 300,
          height: 10,
        },
      },
      {
        params: {
          width: 2999,
          height: 500,
        },
        expected: {
          width: 2999,
          height: 100,
        },
      },
      {
        params: {
          width: 2999,
          height: 101,
        },
        expected: {
          width: 2999,
          height: 100,
        },
      },
      {
        params: {
          width: 100,
          height: 500,
        },
        expected: {
          width: 100,
          height: 4,
        },
      },
      {
        params: {
          width: 100,
          height: 101,
        },
        expected: {
          width: 100,
          height: 4,
        },
      },
      {
        params: {
          width: 10,
          height: 500,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },
      {
        params: {
          width: 10,
          height: 101,
        },
        expected: {
          width: 10,
          height: 1,
        },
      },
    ],
  },

  // SVG with intrinsic size: 100x3000
  {
    basename: "intrinsic_size_100x3000.svg",
    cases: [
      // no desired size
      {
        params: {},
        expected: {
          width: 100,
          height: 3000,
        },
      },
      {
        params: {
          width: 0,
          height: 0,
        },
        expected: {
          width: 100,
          height: 3000,
        },
      },
      {
        params: {
          width: 0,
          height: 12,
        },
        expected: {
          width: 100,
          height: 3000,
        },
      },
      {
        params: {
          width: 12,
          height: 0,
        },
        expected: {
          width: 100,
          height: 3000,
        },
      },

      // desired size same as intrinsic
      {
        params: {
          width: 100,
          height: 3000,
        },
        expected: {
          width: 100,
          height: 3000,
        },
      },

      // desired sizes larger than intrinsic in both dimensions
      {
        params: {
          width: 5000,
          height: 5000,
        },
        expected: {
          width: 100,
          height: 3000,
        },
      },
      {
        params: {
          width: 101,
          height: 3001,
        },
        expected: {
          width: 100,
          height: 3000,
        },
      },
      {
        params: {
          width: 3002,
          height: 3001,
        },
        expected: {
          width: 100,
          height: 3000,
        },
      },

      // desired sizes smaller than intrinsic in both dimensions
      {
        params: {
          width: 99,
          height: 2999,
        },
        expected: {
          width: 99,
          height: 2970,
        },
      },
      {
        params: {
          width: 10,
          height: 2999,
        },
        expected: {
          width: 10,
          height: 300,
        },
      },
      {
        params: {
          width: 99,
          height: 100,
        },
        expected: {
          width: 4,
          height: 100,
        },
      },
      {
        params: {
          width: 99,
          height: 10,
        },
        expected: {
          width: 1,
          height: 10,
        },
      },
      {
        params: {
          width: 10,
          height: 10,
        },
        expected: {
          width: 1,
          height: 10,
        },
      },

      // desired sizes larger in one dimension, smaller in the other
      {
        params: {
          width: 99,
          height: 5000,
        },
        expected: {
          width: 99,
          height: 2970,
        },
      },
      {
        params: {
          width: 10,
          height: 5000,
        },
        expected: {
          width: 10,
          height: 300,
        },
      },
      {
        params: {
          width: 99,
          height: 3001,
        },
        expected: {
          width: 99,
          height: 2970,
        },
      },
      {
        params: {
          width: 10,
          height: 3001,
        },
        expected: {
          width: 10,
          height: 300,
        },
      },
      {
        params: {
          width: 500,
          height: 2999,
        },
        expected: {
          width: 100,
          height: 2999,
        },
      },
      {
        params: {
          width: 101,
          height: 2999,
        },
        expected: {
          width: 100,
          height: 2999,
        },
      },
      {
        params: {
          width: 500,
          height: 100,
        },
        expected: {
          width: 4,
          height: 100,
        },
      },
      {
        params: {
          width: 101,
          height: 100,
        },
        expected: {
          width: 4,
          height: 100,
        },
      },
      {
        params: {
          width: 500,
          height: 10,
        },
        expected: {
          width: 1,
          height: 10,
        },
      },
      {
        params: {
          width: 101,
          height: 10,
        },
        expected: {
          width: 1,
          height: 10,
        },
      },
    ],
  },

  // PNG: 200x100
  {
    basename: "firebird_200x100.png",
    cases: [
      // no desired size
      {
        params: {},
        expected: {
          width: 200,
          height: 100,
        },
      },
      {
        params: {
          width: 0,
          height: 0,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },
      {
        params: {
          width: 0,
          height: 12,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },
      {
        params: {
          width: 12,
          height: 0,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },

      // desired size same as intrinsic
      {
        params: {
          width: 200,
          height: 100,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },

      // desired sizes larger than intrinsic in both dimensions
      {
        params: {
          width: 500,
          height: 500,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },
      {
        params: {
          width: 500,
          height: 101,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },
      {
        params: {
          width: 201,
          height: 500,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },
      {
        params: {
          width: 201,
          height: 101,
        },
        expected: {
          width: 200,
          height: 100,
        },
      },

      // desired sizes smaller than intrinsic in both dimensions
      {
        params: {
          width: 199,
          height: 99,
        },
        expected: {
          width: 198,
          height: 99,
        },
      },
      {
        params: {
          width: 199,
          height: 10,
        },
        expected: {
          width: 20,
          height: 10,
        },
      },
      {
        params: {
          width: 60,
          height: 60,
        },
        expected: {
          width: 60,
          height: 30,
        },
      },
      {
        params: {
          width: 60,
          height: 30,
        },
        expected: {
          width: 60,
          height: 30,
        },
      },
      {
        params: {
          width: 60,
          height: 10,
        },
        expected: {
          width: 20,
          height: 10,
        },
      },
      {
        params: {
          width: 30,
          height: 60,
        },
        expected: {
          width: 30,
          height: 15,
        },
      },
      {
        params: {
          width: 30,
          height: 30,
        },
        expected: {
          width: 30,
          height: 15,
        },
      },
      {
        params: {
          width: 30,
          height: 10,
        },
        expected: {
          width: 20,
          height: 10,
        },
      },
      {
        params: {
          width: 10,
          height: 99,
        },
        expected: {
          width: 10,
          height: 5,
        },
      },
      {
        params: {
          width: 10,
          height: 10,
        },
        expected: {
          width: 10,
          height: 5,
        },
      },

      // desired sizes larger in one dimension, smaller in the other
      {
        params: {
          width: 500,
          height: 99,
        },
        expected: {
          width: 198,
          height: 99,
        },
      },
      {
        params: {
          width: 500,
          height: 10,
        },
        expected: {
          width: 20,
          height: 10,
        },
      },
      {
        params: {
          width: 201,
          height: 99,
        },
        expected: {
          width: 198,
          height: 99,
        },
      },
      {
        params: {
          width: 201,
          height: 10,
        },
        expected: {
          width: 20,
          height: 10,
        },
      },
      {
        params: {
          width: 150,
          height: 150,
        },
        expected: {
          width: 150,
          height: 75,
        },
      },
      {
        params: {
          width: 10,
          height: 500,
        },
        expected: {
          width: 10,
          height: 5,
        },
      },
      {
        params: {
          width: 10,
          height: 101,
        },
        expected: {
          width: 10,
          height: 5,
        },
      },
    ],
  },
];

function getImageSize(params) {
  let uri = "moz-remote-image://?" + params;
  return new Promise(resolve => {
    const image = new Image();
    image.src = uri;
    image.addEventListener("load", () => {
      resolve({ width: image.width, height: image.height });
    });
    image.addEventListener("error", () => {
      info("getImageSize got an error");
      resolve({ error: true });
    });
  });
}

function getImageUrl(basename) {
  return (
    getRootDirectory(gTestPath).replace(
      "chrome://mochitests/content/",
      "http://mochi.test:8888/"
    ) + basename
  );
}

add_task(async function size() {
  for (let { basename, cases } of TESTS) {
    // Augment this image's test cases so that each case with size params gets
    // two additional related cases: with `stretch: false` and `stretch: true`.
    let allCases = [];
    for (let testCase of cases) {
      allCases.push(testCase);

      let { params, expected } = testCase;
      if (params.hasOwnProperty("width") && params.hasOwnProperty("height")) {
        // `stretch: false`
        allCases.push({
          expected,
          params: {
            ...params,
            stretch: false,
          },
        });

        // `stretch: true`
        if (!params.width || !params.height) {
          allCases.push({
            params: {
              ...params,
              stretch: true,
            },
            expected: {
              error: true,
            },
          });
        } else {
          allCases.push({
            params: {
              ...params,
              stretch: true,
            },
            expected: {
              ...expected,
              width: params.width,
              height: params.height,
            },
          });
        }
      }
    }

    for (let testCase of allCases) {
      let actual = await getImageSize(
        new URLSearchParams({
          url: getImageUrl(basename),
          ...testCase.params,
        })
      );
      Assert.deepEqual(
        actual,
        testCase.expected,
        "getImageSize for test case: " +
          JSON.stringify({ basename, ...testCase })
      );
    }
  }
});
