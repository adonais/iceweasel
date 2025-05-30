export const description = `
Execution Tests for the f16 arithmetic unary expression operations
`;

import { makeTestGroup } from '../../../../../common/framework/test_group.js';
import { AllFeaturesMaxLimitsGPUTest } from '../../../../gpu_test.js';
import { Type } from '../../../../util/conversion.js';
import { allInputSources, run } from '../expression.js';

import { d } from './f16_arithmetic.cache.js';
import { unary } from './unary.js';

export const g = makeTestGroup(AllFeaturesMaxLimitsGPUTest);

g.test('negation')
  .specURL('https://www.w3.org/TR/WGSL/#floating-point-evaluation')
  .desc(
    `
Expression: -x
Accuracy: Correctly rounded
`
  )
  .params(u =>
    u.combine('inputSource', allInputSources).combine('vectorize', [undefined, 2, 3, 4] as const)
  )
  .fn(async t => {
    t.skipIfDeviceDoesNotHaveFeature('shader-f16');
    const cases = await d.get('negation');
    await run(t, unary('-'), [Type.f16], Type.f16, t.params, cases);
  });
