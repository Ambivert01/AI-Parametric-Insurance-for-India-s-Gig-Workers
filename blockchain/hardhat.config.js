import "@nomicfoundation/hardhat-toolbox";

export default {
  solidity: { version: "0.8.20", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    hardhat: { chainId: 31337 },
    sepolia: {
      url: process.env.ETHEREUM_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.ORACLE_PRIVATE_KEY ? [process.env.ORACLE_PRIVATE_KEY] : [],
    },
  },
};
