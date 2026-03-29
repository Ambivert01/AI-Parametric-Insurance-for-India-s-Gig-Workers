const logger = require('../../utils/logger');

// Lazy-load ethers to avoid crash if not configured
let _provider = null;
let _wallet = null;
let _contract = null;

const getProvider = () => {
  if (!_provider) {
    try {
      const { ethers } = require('ethers');
      _provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    } catch (err) {
      logger.warn(`Blockchain provider init failed: ${err.message}`);
    }
  }
  return _provider;
};

const getWallet = () => {
  if (!_wallet && process.env.ORACLE_PRIVATE_KEY) {
    try {
      const { ethers } = require('ethers');
      _wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, getProvider());
    } catch (err) {
      logger.warn(`Blockchain wallet init failed: ${err.message}`);
    }
  }
  return _wallet;
};

// ─── Mock blockchain logging for dev ──────────────────────
const mockLog = (type, data) => {
  const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  logger.info(`[MOCK BLOCKCHAIN] ${type}: ${JSON.stringify(data)} → txHash: ${txHash}`);
  return { hash: txHash, blockNumber: Math.floor(Math.random() * 1000000) + 5000000, mock: true };
};

const logTriggerOnChain = async (triggerId) => {
  const TriggerEvent = require('../../models/TriggerEvent');
  const trigger = await TriggerEvent.findById(triggerId);
  if (!trigger || trigger.loggedOnChain) return;

  if (!process.env.ETHEREUM_RPC_URL || !process.env.ORACLE_PRIVATE_KEY) {
    const result = mockLog('TRIGGER', { triggerId, type: trigger.triggerType, city: trigger.cityId });
    trigger.blockchainTxHash = result.hash;
    trigger.loggedOnChain = true;
    await trigger.save();
    return result;
  }

  try {
    const wallet = getWallet();
    if (!wallet) throw new Error('Wallet not initialized');
    // Real contract call would go here
    const result = mockLog('TRIGGER_PRODUCTION', { triggerId });
    trigger.blockchainTxHash = result.hash;
    trigger.loggedOnChain = true;
    await trigger.save();
    return result;
  } catch (err) {
    logger.error(`On-chain trigger log failed: ${err.message}`);
    throw err;
  }
};

const logPayoutOnChain = async ({ claimId, payoutId, riderId, amountInr }) => {
  const Claim = require('../../models/Claim');
  const { Payout } = require('../../models/index');

  const claim = await Claim.findById(claimId);
  if (claim?.loggedOnChain) return;

  const result = mockLog('PAYOUT', { claimId, amountInr, riderId });

  if (claim) {
    claim.blockchainTxHash = result.hash;
    claim.loggedOnChain = true;
    await claim.save();
  }

  if (payoutId) {
    await Payout.findByIdAndUpdate(payoutId, {
      $set: { blockchainTxHash: result.hash, onChainLogged: true },
    });
  }

  return result;
};

module.exports = { logTriggerOnChain, logPayoutOnChain };
