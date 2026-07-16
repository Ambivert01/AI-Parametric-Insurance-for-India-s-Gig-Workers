// Hardhat 3 requires defineConfig() and an explicit plugins: [] array —
// importing a plugin alone (the Hardhat 2 style this file used to use)
// registers nothing in Hardhat 3. It also previously imported
// @nomicfoundation/hardhat-toolbox, which is the Hardhat-2-targeted
// package and does not work with Hardhat 3 at all (confirmed: `hardhat
// compile` failed immediately with a version-compatibility warning and a
// nonzero exit code before ever reaching solc). hardhat-toolbox-mocha-ethers
// is the Hardhat-3-native bundle matching this project's actual test style
// (require("hardhat"), chai `expect`, mocha .cjs test files).
import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.ETHEREUM_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.ORACLE_PRIVATE_KEY ? [process.env.ORACLE_PRIVATE_KEY] : [],
    },
  },
});
