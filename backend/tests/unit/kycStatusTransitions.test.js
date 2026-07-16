jest.mock('../../src/models/User');
jest.mock('../../src/config/redis', () => ({
  redis: { del: jest.fn().mockResolvedValue(1), get: jest.fn(), set: jest.fn() },
  KEYS: { session: (id) => `session:${id}` },
}));

const User = require('../../src/models/User');
const { verifySelfie } = require('../../src/services/kyc/kycService');
const { KYC_STATUS } = require('../../src/config/constants');

// Helper to mock User.findById(...).select(...).lean() resolving to `doc`
const mockFindById = (doc) => {
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(doc),
    }),
  });
};

describe('kycService.verifySelfie — regression guard for the status-regression bug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  });

  test('a fresh user (PHONE_VERIFIED, no prior KYC) stays at PHONE_VERIFIED after selfie', async () => {
    mockFindById({ kyc: { status: KYC_STATUS.PHONE_VERIFIED }, bankDetails: { verified: false } });

    await verifySelfie('rider1', 'base64data');

    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.$set['kyc.status']).toBe(KYC_STATUS.PHONE_VERIFIED);
  });

  test('a user who already completed Aadhaar verification does NOT get regressed back to PHONE_VERIFIED by submitting a selfie', async () => {
    // This is the exact bug: the old code unconditionally reset status to
    // PHONE_VERIFIED regardless of prior progress.
    mockFindById({ kyc: { status: KYC_STATUS.AADHAAR_VERIFIED }, bankDetails: { verified: false } });

    await verifySelfie('rider2', 'base64data');

    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.$set['kyc.status']).toBe(KYC_STATUS.AADHAAR_VERIFIED);
    expect(update.$set['kyc.status']).not.toBe(KYC_STATUS.PHONE_VERIFIED);
  });

  test('a user with Aadhaar verified AND bank verified reaches FULL status after selfie', async () => {
    mockFindById({ kyc: { status: KYC_STATUS.AADHAAR_VERIFIED }, bankDetails: { verified: true } });

    await verifySelfie('rider3', 'base64data');

    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.$set['kyc.status']).toBe(KYC_STATUS.FULL);
  });

  test('selfie image data itself is always persisted regardless of status outcome', async () => {
    mockFindById({ kyc: { status: KYC_STATUS.PHONE_VERIFIED }, bankDetails: { verified: false } });

    await verifySelfie('rider4', 'base64data');

    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.$set['kyc.selfieUrl']).toBeDefined();
    expect(update.$set['kyc.livenessScore']).toBeDefined();
  });
});
