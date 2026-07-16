jest.mock('../../src/models/TriggerEvent');

describe('blockchainOracle — honest mock vs real distinction', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ETHEREUM_RPC_URL;
    delete process.env.ORACLE_PRIVATE_KEY;
    delete process.env.GIGSHIELD_CONTRACT_ADDRESS;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('isFullyConfigured is false when no env vars are set', () => {
    const { isFullyConfigured } = require('../../src/services/blockchain/blockchainOracle');
    expect(isFullyConfigured()).toBe(false);
  });

  test('isFullyConfigured is false when only some of the 3 required vars are set', () => {
    process.env.ETHEREUM_RPC_URL = 'https://example.com';
    process.env.ORACLE_PRIVATE_KEY = '0x' + '1'.repeat(64);
    // GIGSHIELD_CONTRACT_ADDRESS intentionally left unset
    const { isFullyConfigured } = require('../../src/services/blockchain/blockchainOracle');
    expect(isFullyConfigured()).toBe(false);
  });

  test('isFullyConfigured is true only when all 3 are set', () => {
    process.env.ETHEREUM_RPC_URL = 'https://example.com';
    process.env.ORACLE_PRIVATE_KEY = '0x' + '1'.repeat(64);
    process.env.GIGSHIELD_CONTRACT_ADDRESS = '0x' + '2'.repeat(40);
    const { isFullyConfigured } = require('../../src/services/blockchain/blockchainOracle');
    expect(isFullyConfigured()).toBe(true);
  });

  test('logTriggerOnChain in unconfigured (mock) mode honestly marks onChainNetwork as mock', async () => {
    const TriggerEvent = require('../../src/models/TriggerEvent');
    const mockTrigger = {
      loggedOnChain: false,
      triggerType: 'HEAVY_RAIN',
      cityId: 'mumbai',
      save: jest.fn().mockResolvedValue(true),
    };
    TriggerEvent.findById.mockResolvedValue(mockTrigger);

    const { logTriggerOnChain } = require('../../src/services/blockchain/blockchainOracle');
    const result = await logTriggerOnChain('trigger123');

    expect(result.network).toBe('mock');
    expect(mockTrigger.onChainNetwork).toBe('mock');
    expect(mockTrigger.blockchainTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(mockTrigger.loggedOnChain).toBe(true);
  });

  test('already-logged triggers are not re-logged', async () => {
    const TriggerEvent = require('../../src/models/TriggerEvent');
    const mockTrigger = { loggedOnChain: true, save: jest.fn() };
    TriggerEvent.findById.mockResolvedValue(mockTrigger);

    const { logTriggerOnChain } = require('../../src/services/blockchain/blockchainOracle');
    const result = await logTriggerOnChain('trigger123');

    expect(result).toBeUndefined();
    expect(mockTrigger.save).not.toHaveBeenCalled();
  });
});
