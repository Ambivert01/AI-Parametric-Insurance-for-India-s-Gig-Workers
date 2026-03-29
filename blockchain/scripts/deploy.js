// scripts/deploy.js — Deploy both contracts to testnet
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  const oracleAddress = process.env.ORACLE_WALLET_ADDRESS || deployer.address;

  // 1. Deploy GigShieldPolicy
  console.log("\n1. Deploying GigShieldPolicy...");
  const GigShieldPolicy = await ethers.getContractFactory("GigShieldPolicy");
  const policy = await GigShieldPolicy.deploy(oracleAddress);
  await policy.waitForDeployment();
  const policyAddr = await policy.getAddress();
  console.log("   GigShieldPolicy deployed:", policyAddr);

  // 2. Deploy GigShieldLoyaltyPool
  console.log("\n2. Deploying GigShieldLoyaltyPool...");
  const GigShieldLoyaltyPool = await ethers.getContractFactory("GigShieldLoyaltyPool");
  const pool = await GigShieldLoyaltyPool.deploy(oracleAddress);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("   GigShieldLoyaltyPool deployed:", poolAddr);

  // 3. Export ABIs for backend + frontend
  console.log("\n3. Exporting ABIs...");
  const outputDir = path.join(__dirname, "../abis");
  fs.mkdirSync(outputDir, { recursive: true });

  const policyArtifact = await artifacts.readArtifact("GigShieldPolicy");
  const poolArtifact = await artifacts.readArtifact("GigShieldLoyaltyPool");

  fs.writeFileSync(
    path.join(outputDir, "GigShieldPolicy.json"),
    JSON.stringify({ address: policyAddr, abi: policyArtifact.abi }, null, 2)
  );
  fs.writeFileSync(
    path.join(outputDir, "GigShieldLoyaltyPool.json"),
    JSON.stringify({ address: poolAddr, abi: poolArtifact.abi }, null, 2)
  );

  // 4. Update .env with deployed addresses
  const envPath = path.join(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    env = env.replace(/GIGSHIELD_CONTRACT_ADDRESS=.*/,  `GIGSHIELD_CONTRACT_ADDRESS=${policyAddr}`);
    env = env.replace(/LOYALTY_POOL_CONTRACT_ADDRESS=.*/, `LOYALTY_POOL_CONTRACT_ADDRESS=${poolAddr}`);
    fs.writeFileSync(envPath, env);
    console.log("   Updated .env with contract addresses");
  }

  console.log("\n✅ Deployment complete!");
  console.log("   Policy:       ", policyAddr);
  console.log("   LoyaltyPool:  ", poolAddr);
  console.log("   Oracle:       ", oracleAddress);
  console.log("\nVerify on Etherscan:");
  console.log(`   npx hardhat verify --network sepolia ${policyAddr} ${oracleAddress}`);
  console.log(`   npx hardhat verify --network sepolia ${poolAddr} ${oracleAddress}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
