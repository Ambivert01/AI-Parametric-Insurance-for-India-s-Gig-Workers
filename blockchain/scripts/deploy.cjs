// scripts/deploy.cjs — the single canonical deploy script for both contracts.
//
// Previously there were three separate, mutually-inconsistent deploy
// scripts in this folder:
//   - deploy.cjs used `hre.network.name` without ever obtaining `hre`,
//     which would throw ReferenceError partway through (after already
//     spending gas deploying both contracts).
//   - deploy.js expected a different env var (ORACLE_WALLET_ADDRESS) than
//     deploy.cjs did (ORACLE_PUBLIC_KEY) for the same value, and than the
//     backend + hardhat.config.js do (ORACLE_PRIVATE_KEY).
//   - deploy-mock.js hand-typed a fictional ABI that didn't match the real
//     contracts at all (missing functions, and referenced two Pool
//     functions — getCurrentPool/getPoolSummary — that don't exist on the
//     real contract, which only has getWeekPool/getRiderStats).
// This script replaces all three: it derives the oracle's public address
// directly from ORACLE_PRIVATE_KEY (the same key the backend signs with),
// so the deployed contract's oracle address can never drift out of sync
// with what the backend actually authenticates as, and it always exports
// the real, compiler-verified ABI — never a hand-typed one.
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Derive the oracle's public address from its private key — the same
  // key the backend's blockchainOracle.js signs on-chain writes with — so
  // there's no separate env var that can fall out of sync with it.
  let oracleAddress = deployer.address;
  if (process.env.ORACLE_PRIVATE_KEY) {
    oracleAddress = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY).address;
  } else {
    console.log("⚠️  ORACLE_PRIVATE_KEY not set — using deployer address as oracle (fine for local dev only)");
  }
  console.log("Oracle address:", oracleAddress);

  console.log("\n📋 Deploying GigShieldPolicy...");
  const GigShieldPolicy = await ethers.getContractFactory("GigShieldPolicy");
  const policy = await GigShieldPolicy.deploy(oracleAddress);
  await policy.waitForDeployment();
  const policyAddress = await policy.getAddress();
  console.log("✅ GigShieldPolicy deployed to:", policyAddress);

  console.log("\n💰 Deploying GigShieldLoyaltyPool...");
  const LoyaltyPool = await ethers.getContractFactory("GigShieldLoyaltyPool");
  const loyaltyPool = await LoyaltyPool.deploy(oracleAddress);
  await loyaltyPool.waitForDeployment();
  const loyaltyPoolAddress = await loyaltyPool.getAddress();
  console.log("✅ GigShieldLoyaltyPool deployed to:", loyaltyPoolAddress);

  // Export the REAL, compiler-verified ABI (never hand-typed) so the
  // backend/frontend always talk to the contract using its actual
  // interface, not a stale or fictional approximation of it.
  console.log("\n📦 Exporting ABIs...");
  const abisDir = path.join(__dirname, "..", "abis");
  fs.mkdirSync(abisDir, { recursive: true });

  const policyArtifact = await hre.artifacts.readArtifact("GigShieldPolicy");
  const poolArtifact = await hre.artifacts.readArtifact("GigShieldLoyaltyPool");
  const network = await ethers.provider.getNetwork();

  fs.writeFileSync(
    path.join(abisDir, "GigShieldPolicy.json"),
    JSON.stringify({ address: policyAddress, network: network.name, abi: policyArtifact.abi }, null, 2)
  );
  fs.writeFileSync(
    path.join(abisDir, "GigShieldLoyaltyPool.json"),
    JSON.stringify({ address: loyaltyPoolAddress, network: network.name, abi: poolArtifact.abi }, null, 2)
  );
  console.log("✅ ABIs written to blockchain/abis/");

  // Save a deployment record for audit history
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, `${network.name}.json`),
    JSON.stringify({
      network: network.name,
      deployedAt: new Date().toISOString(),
      deployer: deployer.address,
      oracle: oracleAddress,
      contracts: { GigShieldPolicy: policyAddress, GigShieldLoyaltyPool: loyaltyPoolAddress },
    }, null, 2)
  );

  console.log("\n🔧 Add these to your backend .env:");
  console.log(`GIGSHIELD_CONTRACT_ADDRESS=${policyAddress}`);
  console.log(`LOYALTY_POOL_CONTRACT_ADDRESS=${loyaltyPoolAddress}`);
  console.log(`ORACLE_PRIVATE_KEY=<the private key matching ${oracleAddress}>`);

  // Smoke test on local networks only
  if (network.chainId === 31337n) {
    console.log("\n🧪 Running smoke test...");
    const tx = await policy.connect(deployer).logTriggerEvent(
      "HEAVY_RAIN", "mumbai", 6500, 5000, 100, "gigshield-oracle-smoketest"
    );
    await tx.wait();
    console.log("✅ Trigger logged. Total events:", (await policy.totalEvents()).toString());
  }

  console.log("\n🎉 Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
