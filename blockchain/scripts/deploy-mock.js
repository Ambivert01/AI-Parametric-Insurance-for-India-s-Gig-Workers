// scripts/deploy-mock.js — Generate mock deployed ABIs for local development
// Run this when you don't have testnet ETH but need the frontend to work
const fs = require("fs");
const path = require("path");

const MOCK_POLICY_ADDRESS    = "0x742d35Cc6634C0532925a3b8D4C9B5690f8f4Ad7";
const MOCK_POOL_ADDRESS      = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const POLICY_ABI = [
  { name: "TriggerLogged", type: "event", inputs: [
    { name: "eventId", type: "uint256", indexed: true },
    { name: "triggerType", type: "string", indexed: false },
    { name: "cityId", type: "string", indexed: false },
    { name: "triggerValue", type: "uint256", indexed: false },
    { name: "timestamp", type: "uint256", indexed: false },
  ]},
  { name: "ClaimLogged", type: "event", inputs: [
    { name: "claimId", type: "uint256", indexed: true },
    { name: "offChainRiderId", type: "bytes32", indexed: true },
    { name: "eventId", type: "uint256", indexed: true },
    { name: "payoutAmountInr", type: "uint256", indexed: false },
    { name: "status", type: "string", indexed: false },
  ]},
  { name: "logTriggerEvent", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "triggerType", type: "string" },
      { name: "cityId", type: "string" },
      { name: "triggerValue", type: "uint256" },
      { name: "threshold", type: "uint256" },
      { name: "payoutPercent", type: "uint256" },
      { name: "dataSourceHash", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  { name: "logClaim", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "offChainRiderId", type: "bytes32" },
      { name: "eventId", type: "uint256" },
      { name: "payoutAmountInr", type: "uint256" },
      { name: "status", type: "string" },
      { name: "fraudTier", type: "string" },
      { name: "txRef", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  { name: "totalEvents", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
  { name: "totalClaims", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
  { name: "getClaimRecord", type: "function", stateMutability: "view",
    inputs: [{ name: "claimId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "claimId", type: "uint256" },
      { name: "offChainRiderId", type: "bytes32" },
      { name: "eventId", type: "uint256" },
      { name: "payoutAmountInr", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "status", type: "string" },
      { name: "fraudTier", type: "string" },
    ]}],
  },
];

const POOL_ABI = [
  { name: "ContributionRecorded", type: "event", inputs: [
    { name: "riderId", type: "bytes32", indexed: true },
    { name: "weekNumber", type: "uint256", indexed: false },
    { name: "amountPaise", type: "uint256", indexed: false },
  ]},
  { name: "getCurrentPool", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "tuple", components: [
      { name: "weekNumber", type: "uint256" },
      { name: "balancePaise", type: "uint256" },
      { name: "contributionsPaise", type: "uint256" },
      { name: "disbursedPaise", type: "uint256" },
      { name: "contributors", type: "uint256" },
      { name: "beneficiaries", type: "uint256" },
      { name: "isClosed", type: "bool" },
    ]}],
  },
  { name: "getPoolSummary", type: "function", stateMutability: "view",
    inputs: [], outputs: [
      { name: "totalContributed", type: "uint256" },
      { name: "totalDisbursed", type: "uint256" },
      { name: "currentBalance", type: "uint256" },
      { name: "week", type: "uint256" },
    ],
  },
];

const outputDir = path.join(__dirname, "../abis");
fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  path.join(outputDir, "GigShieldPolicy.json"),
  JSON.stringify({ address: MOCK_POLICY_ADDRESS, abi: POLICY_ABI, network: "mock" }, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, "GigShieldLoyaltyPool.json"),
  JSON.stringify({ address: MOCK_POOL_ADDRESS, abi: POOL_ABI, network: "mock" }, null, 2)
);

console.log("✅ Mock ABIs generated for local development:");
console.log("   abis/GigShieldPolicy.json");
console.log("   abis/GigShieldLoyaltyPool.json");
console.log("");
console.log("For production: run `npx hardhat run scripts/deploy.js --network sepolia`");
