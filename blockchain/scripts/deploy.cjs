const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Oracle address — the backend wallet that signs transactions
  const oracleAddress = process.env.ORACLE_PUBLIC_KEY || deployer.address;
  console.log("Oracle address:", oracleAddress);

  // 1. Deploy GigShieldPolicy
  console.log("\n📋 Deploying GigShieldPolicy...");
  const GigShieldPolicy = await ethers.getContractFactory("GigShieldPolicy");
  const policy = await GigShieldPolicy.deploy(oracleAddress);
  await policy.waitForDeployment();
  const policyAddress = await policy.getAddress();
  console.log("✅ GigShieldPolicy deployed to:", policyAddress);

  // 2. Deploy GigShieldLoyaltyPool
  console.log("\n💰 Deploying GigShieldLoyaltyPool...");
  const LoyaltyPool = await ethers.getContractFactory("GigShieldLoyaltyPool");
  const loyaltyPool = await LoyaltyPool.deploy(oracleAddress);
  await loyaltyPool.waitForDeployment();
  const loyaltyPoolAddress = await loyaltyPool.getAddress();
  console.log("✅ GigShieldLoyaltyPool deployed to:", loyaltyPoolAddress);

  // 3. Save deployment addresses
  const deployment = {
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    oracle: oracleAddress,
    contracts: {
      GigShieldPolicy: policyAddress,
      GigShieldLoyaltyPool: loyaltyPoolAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  const deployFile = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(deployFile, JSON.stringify(deployment, null, 2));
  console.log("\n📄 Deployment saved to:", deployFile);

  // 4. Output .env values to update
  console.log("\n🔧 Add these to your .env:");
  console.log(`GIGSHIELD_CONTRACT_ADDRESS=${policyAddress}`);
  console.log(`LOYALTY_POOL_CONTRACT_ADDRESS=${loyaltyPoolAddress}`);

  // 5. Quick smoke test on local network
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    console.log("\n🧪 Running smoke test...");
    const tx = await policy.connect(deployer).logTriggerEvent(
      "HEAVY_RAIN", "mumbai", 6500, 5000, 100, "ipfs://QmTestHash123"
    );
    await tx.wait();
    const totalEvents = await policy.totalEvents();
    console.log("✅ Trigger logged. Total events:", totalEvents.toString());

    const event = await policy.getTriggerEvent(1);
    console.log("✅ Event retrieved:", event.triggerType, event.cityId);
  }

  console.log("\n🎉 Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
