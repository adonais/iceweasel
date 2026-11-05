/**
 * Checks that a VideoFrame's copyTo output agrees with the format it reports.
 * The quadrants fixtures are a 64x64 picture of red, green, blue and yellow
 * 32x32 quadrants in BT.601 limited range.
 */
const WIDTH = 64;
const HEIGHT = 64;
const QUADRANTS = [
  { name: "red", x: 0, y: 0, yuv: [81, 90, 240], rgb: [255, 0, 0] },
  { name: "green", x: 32, y: 0, yuv: [145, 54, 34], rgb: [0, 255, 0] },
  { name: "blue", x: 0, y: 32, yuv: [41, 240, 110], rgb: [0, 0, 255] },
  { name: "yellow", x: 32, y: 32, yuv: [210, 16, 146], rgb: [255, 255, 0] },
];

function sampleAt(data, plane, x, y) {
  return data[plane.offset + y * plane.stride + x];
}

function checkI420Planes(frame, label) {
  is(
    frame.allocationSize(),
    (WIDTH * HEIGHT * 3) / 2,
    `${label}: I420 allocation size`
  );

  const full = new Uint8Array(frame.allocationSize());
  return frame.copyTo(full).then(async layout => {
    is(layout.length, 3, `${label}: three planes`);
    is(layout[0].offset, 0, `${label}: Y offset`);
    is(layout[0].stride, WIDTH, `${label}: Y stride`);
    is(layout[1].offset, WIDTH * HEIGHT, `${label}: U offset`);
    is(layout[1].stride, WIDTH / 2, `${label}: U stride`);
    is(layout[2].offset, (WIDTH * HEIGHT * 5) / 4, `${label}: V offset`);
    is(layout[2].stride, WIDTH / 2, `${label}: V stride`);

    for (const q of QUADRANTS) {
      // Sample the quadrant centre and its interior corners.
      for (const [dx, dy] of [
        [16, 16],
        [2, 2],
        [29, 29],
      ]) {
        const x = q.x + dx;
        const y = q.y + dy;
        is(
          sampleAt(full, layout[0], x, y),
          q.yuv[0],
          `${label}: ${q.name} Y at (${x}, ${y})`
        );
        is(
          sampleAt(full, layout[1], x >> 1, y >> 1),
          q.yuv[1],
          `${label}: ${q.name} U at (${x >> 1}, ${y >> 1})`
        );
        is(
          sampleAt(full, layout[2], x >> 1, y >> 1),
          q.yuv[2],
          `${label}: ${q.name} V at (${x >> 1}, ${y >> 1})`
        );
      }
    }

    const repeated = new Uint8Array(full.length);
    await frame.copyTo(repeated);
    ok(
      repeated.every((v, i) => v === full[i]),
      `${label}: repeated copy matches`
    );

    // Straddle red and green so both chroma values appear.
    const rect = { x: 28, y: 4, width: 8, height: 4 };
    const options = {
      rect,
      layout: [
        { offset: 3, stride: 10 },
        { offset: 50, stride: 6 },
        { offset: 70, stride: 6 },
      ],
    };
    const cropped = new Uint8Array(frame.allocationSize(options)).fill(0xcd);
    const croppedLayout = await frame.copyTo(cropped, options);
    is(croppedLayout.length, 3, `${label}: cropped plane count`);
    is(croppedLayout[0].offset, 3, `${label}: cropped Y offset`);
    is(croppedLayout[0].stride, 10, `${label}: cropped Y stride`);
    for (let row = 0; row < rect.height; ++row) {
      for (let col = 0; col < rect.width; ++col) {
        is(
          sampleAt(cropped, croppedLayout[0], col, row),
          sampleAt(full, layout[0], rect.x + col, rect.y + row),
          `${label}: cropped Y (${col}, ${row})`
        );
      }
    }
    for (let row = 0; row < rect.height / 2; ++row) {
      for (let col = 0; col < rect.width / 2; ++col) {
        is(
          sampleAt(cropped, croppedLayout[1], col, row),
          sampleAt(full, layout[1], rect.x / 2 + col, rect.y / 2 + row),
          `${label}: cropped U (${col}, ${row})`
        );
        is(
          sampleAt(cropped, croppedLayout[2], col, row),
          sampleAt(full, layout[2], rect.x / 2 + col, rect.y / 2 + row),
          `${label}: cropped V (${col}, ${row})`
        );
      }
    }

    try {
      await frame.copyTo(new Uint8Array(full.length - 1));
      ok(false, `${label}: undersized destination should reject`);
    } catch (e) {
      ok(e instanceof TypeError, `${label}: undersized destination rejects`);
    }
  });
}

function checkNV12Planes(frame, label) {
  is(
    frame.allocationSize(),
    (WIDTH * HEIGHT * 3) / 2,
    `${label}: NV12 allocation size`
  );
  const full = new Uint8Array(frame.allocationSize());
  return frame.copyTo(full).then(layout => {
    is(layout.length, 2, `${label}: two planes`);
    for (const q of QUADRANTS) {
      const x = q.x + 16;
      const y = q.y + 16;
      is(
        sampleAt(full, layout[0], x, y),
        q.yuv[0],
        `${label}: ${q.name} Y at (${x}, ${y})`
      );
      is(
        sampleAt(full, layout[1], x, y >> 1),
        q.yuv[1],
        `${label}: ${q.name} U at (${x >> 1}, ${y >> 1})`
      );
      is(
        sampleAt(full, layout[1], x + 1, y >> 1),
        q.yuv[2],
        `${label}: ${q.name} V at (${x >> 1}, ${y >> 1})`
      );
    }
  });
}

function checkRGBPixels(frame, label) {
  is(
    frame.allocationSize(),
    WIDTH * HEIGHT * 4,
    `${label}: ${frame.format} allocation size`
  );
  const full = new Uint8Array(frame.allocationSize());
  return frame.copyTo(full).then(layout => {
    is(layout.length, 1, `${label}: one plane`);
    const bgr = frame.format.startsWith("BGR");
    for (const q of QUADRANTS) {
      const x = q.x + 16;
      const y = q.y + 16;
      const base = layout[0].offset + y * layout[0].stride + x * 4;
      const r = full[base + (bgr ? 2 : 0)];
      const g = full[base + 1];
      const b = full[base + (bgr ? 0 : 2)];
      // Either matrix may be used; check which side each channel lands on.
      for (const [channel, actual, expected] of [
        ["R", r, q.rgb[0]],
        ["G", g, q.rgb[1]],
        ["B", b, q.rgb[2]],
      ]) {
        ok(
          expected ? actual >= 190 : actual <= 64,
          `${label}: ${q.name} ${channel} is ${actual}, expected ` +
            `${expected ? "high" : "low"}`
        );
      }
    }
  });
}

async function checkFormatMatchesPlanes(frame, label) {
  switch (frame.format) {
    case "I420":
      await checkI420Planes(frame, label);
      break;
    case "NV12":
      await checkNV12Planes(frame, label);
      break;
    case "RGBA":
    case "RGBX":
    case "BGRA":
    case "BGRX":
      await checkRGBPixels(frame, label);
      break;
    default:
      ok(false, `${label}: unexpected format ${frame.format}`);
  }
}
