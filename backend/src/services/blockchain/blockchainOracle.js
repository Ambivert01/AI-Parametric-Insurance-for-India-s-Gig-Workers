const path = require('path');
const logger = require('../../utils/logger');

// Lazy-load ethers to avoid crash if not configured
let _provider = null;
let _wallet = null;
let _policyContract = null;

const getProvider = () => {
  if (!_provider && process.env.ETHEREUM_RPC_URL) {
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
      const provider = getProvider();
      if (!provider) return null;
      _wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, provider);
    } catch (err) {
      logger.warn(`Blockchain wallet init failed: ${err.message}`);
    }
  }
  return _wallet;
};

// Real on-chain interaction requires all three: RPC URL, oracle signing
// key, and a deployed contract address. Previously this module never
// actually loaded the ABI or constructed a Contract instance at all —
// even the branch that checked for full configuration just called the
// same mockLog() as the unconfigured path, so "on-chain" logging was
// 100% simulated regardless of environment, while the frontend still
// rendered a "Verify on Etherscan ↗" link using the fake hash as if it
// were real.
const isFullyConfigured = () =>
  !!(process.env.ETHEREUM_RPC_URL && process.env.ORACLE_PRIVATE_KEY && process.env.GIGSHIELD_CONTRACT_ADDRESS);

const getPolicyContract = () => {
  if (_policyContract) return _policyContract;
  const wallet = getWallet();
  if (!wallet || !process.env.GIGSHIELD_CONTRACT_ADDRESS) return null;
  try {
    const { ethers } = require('ethers');
    const { abi } = require(path.join('..', '..', '..', '..', 'blockchain', 'abis', 'GigShieldPolicy.json'));
    _policyContract = new ethers.Contract(process.env.GIGSHIELD_CONTRACT_ADDRESS, abi, wallet);
    return _policyContract;
  } catch (err) {
    logger.warn(`Blockchain contract init failed: ${err.message}`);
    return null;
  }
};

// ─── Mock blockchain logging for dev ──────────────────────
const mockLog = (type, data) => {
  const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  logger.info(`[MOCK BLOCKCHAIN] ${type}: ${JSON.stringify(data)} → txHash: ${txHash}`);
  return { hash: txHash, blockNumber: Math.floor(Math.random() * 1000000) + 5000000, network: 'mock' };
};

const hashRiderId = (riderId) => {
  const { ethers } = require('ethers');
  return ethers.keccak256(ethers.toUtf8Bytes(riderId.toString()));
};

const logTriggerOnChain = async (triggerId) => {
  const TriggerEvent = require('../../models/TriggerEvent');
  const trigger = await TriggerEvent.findById(triggerId);
  if (!trigger || trigger.loggedOnChain) return;

  const contract = isFullyConfigured() ? getPolicyContract() : null;

  if (!contract) {
    const result = mockLog('TRIGGER', { triggerId, type: trigger.triggerType, city: trigger.cityId });
    trigger.blockchainTxHash = result.hash;
    trigger.onChainNetwork = 'mock';
    trigger.loggedOnChain = true;
    await trigger.save();
    return result;
  }

  try {
    const tx = await contract.logTriggerEvent(
      trigger.triggerType,
      trigger.cityId,
      Math.round(trigger.triggerValue * 100),
      Math.round(trigger.threshold * 100),
      trigger.payoutPercent,
      trigger.primarySource?.source || 'gigshield-oracle'
    );
    const receipt = await tx.wait();
    const network = await getProvider().getNetwork();

    trigger.blockchainTxHash = receipt.hash;
    trigger.onChainNetwork = network.name;
    trigger.loggedOnChain = true;
    await trigger.save();

    logger.info(`Trigger ${triggerId} logged on-chain: ${receipt.hash} (${network.name})`);
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, network: network.name };
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

  const contract = isFullyConfigured() ? getPolicyContract() : null;
  let result;

  if (!contract) {
    result = mockLog('PAYOUT', { claimId, amountInr, riderId });
  } else {
    try {
      const { ethers } = require('ethers');
      const txRefHash = ethers.keccak256(ethers.toUtf8Bytes(String(payoutId || claimId)));
      const tx = await contract.logClaim(
        hashRiderId(riderId),
        claim.onChainEventId || 0,
        Math.round(amountInr * 100),
        claim.status?.toUpperCase() || 'APPROVED',
        claim.fraudCheck?.tier || 'GREEN',
        txRefHash
      );
      const receipt = await tx.wait();
      const network = await getProvider().getNetwork();
      result = { hash: receipt.hash, blockNumber: receipt.blockNumber, network: network.name };
      logger.info(`Payout for claim ${claimId} logged on-chain: ${receipt.hash} (${network.name})`);
    } catch (err) {
      logger.error(`On-chain payout log failed: ${err.message}`);
      throw err;
    }
  }

  if (claim) {
    claim.blockchainTxHash = result.hash;
    claim.onChainNetwork = result.network;
    claim.loggedOnChain = true;
    await claim.save();
  }

  if (payoutId) {
    await Payout.findByIdAndUpdate(payoutId, {
      $set: { blockchainTxHash: result.hash, onChainNetwork: result.network, onChainLogged: true },
    });
  }

  return result;
};

module.exports = { logTriggerOnChain, logPayoutOnChain, isFullyConfigured };
