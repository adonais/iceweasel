/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { FeatureModel } from "lib/InferredModel/FeatureModel.sys.mjs";

const jsonData = {
  model_id: "test",
  schema_ver: 1,
  day_time_weighting: {
    days: [3, 14, 45],
    relative_weight: [0.33, 0.33, 0.33],
  },
  interest_vector: {
    cryptosport: {
      features: { crypto: 0.5, sport: 0.5 },
      thresholds: [0.3, 0.4, 0.5],
    },
    parenting: {
      features: { parenting: 1 },
      thresholds: [0.3, 0.4],
    },
  },
};

describe("Inferred Model", () => {
  it("create model", () => {
    const model = FeatureModel.fromJSON(jsonData);
    expect(model.model_id).toEqual(jsonData.modelId);
  });
  it("create time intervals", () => {
    const model = FeatureModel.fromJSON(jsonData);
    expect(model.model_id).toEqual(jsonData.modelId);

    const curTime = new Date();
    const intervals = model.getDateIntervals(curTime);

    expect(intervals).toHaveLength(jsonData.day_time_weighting.days.length);
    for (const interval of intervals) {
      expect(interval.start < curTime.getTime()).toBe(true);
      expect(interval.end <= curTime.getTime()).toBe(true);
      expect(interval.start <= interval.end).toBe(true);
    }
  });
});
