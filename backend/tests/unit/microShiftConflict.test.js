jest.mock('../../src/models/User');
jest.mock('../../src/models/Policy');
jest.mock('../../src/config/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
  KEYS: {},
}));

const User = require('../../src/models/User');
const Policy = require('../../src/models/Policy');
const { getShiftQuote } = require('../../src/services/policy/shiftPolicyService');

describe('getShiftQuote — regression guard for the dead weekly-conflict check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          riderProfile: { cityId: 'mumbai', platform: 'zomato' },
          loyaltyDiscount: 0,
        }),
      }),
    });
  });

  test('a rider with an active WEEKLY policy is rejected with a clear 409, not silently quoted', async () => {
    // This is the exact bug: weeklyPolicy used to be fetched via
    // Policy.findOne(...) and then never actually checked anywhere.
    Policy.findOne.mockResolvedValue({ _id: 'existing-weekly-policy', policyType: 'WEEKLY' });

    await expect(getShiftQuote('rider1', 19.07, 72.87)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('Policy.findOne is called scoped to policyType WEEKLY — a rider with only a prior SHIFT policy this week is not blocked', async () => {
    Policy.findOne.mockResolvedValue(null); // no WEEKLY policy found

    await expect(getShiftQuote('rider2', 19.07, 72.87)).resolves.toBeDefined();

    const queryArg = Policy.findOne.mock.calls[0][0];
    expect(queryArg.policyType).toBe('WEEKLY');
  });

  test('a rider with no weekly conflict gets a real quote back for every tier', async () => {
    Policy.findOne.mockResolvedValue(null);

    const quote = await getShiftQuote('rider3', 19.07, 72.87);

    expect(Object.keys(quote)).toEqual(expect.arrayContaining(['BASIC', 'STANDARD', 'PRO', 'ELITE']));
  });
});
