const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GigShieldPolicy", function () {
  let policy, owner, oracle, user;

  beforeEach(async function () {
    [owner, oracle, user] = await ethers.getSigners();
    const GigShieldPolicy = await ethers.getContractFactory("GigShieldPolicy");
    policy = await GigShieldPolicy.deploy(oracle.address);
  });

  it("deploys with correct oracle", async function () {
    expect(await policy.oracle()).to.equal(oracle.address);
    expect(await policy.owner()).to.equal(owner.address);
  });

  it("logs a trigger event from oracle", async function () {
    const tx = await policy.connect(oracle).logTriggerEvent(
      "HEAVY_RAIN", "mumbai", 6500, 5000, 100, "ipfs://QmHash123"
    );
    await tx.wait();
    expect(await policy.totalEvents()).to.equal(1);
    const event = await policy.getTriggerEvent(1);
    expect(event.triggerType).to.equal("HEAVY_RAIN");
    expect(event.cityId).to.equal("mumbai");
    expect(event.verified).to.be.true;
  });

  it("prevents non-oracle from logging events", async function () {
    await expect(
      policy.connect(user).logTriggerEvent("HEAVY_RAIN", "mumbai", 6500, 5000, 100, "ipfs://hash")
    ).to.be.revertedWith("GigShield: caller is not oracle");
  });

  it("prevents duplicate event in same 6-hour window", async function () {
    await policy.connect(oracle).logTriggerEvent("HEAVY_RAIN", "mumbai", 6500, 5000, 100, "ipfs://hash1");
    await expect(
      policy.connect(oracle).logTriggerEvent("HEAVY_RAIN", "mumbai", 6000, 5000, 100, "ipfs://hash2")
    ).to.be.revertedWith("GigShield: event already logged for this period");
  });

  it("logs a claim with full details", async function () {
    await policy.connect(oracle).logTriggerEvent("HEAVY_RAIN", "mumbai", 6500, 5000, 100, "ipfs://hash");
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("rider_mongodb_id_123"));
    const txRef = ethers.keccak256(ethers.toUtf8Bytes("razorpay_tx_ref_xyz"));

    await policy.connect(oracle).logClaim(riderId, 1, 35000, "APPROVED", "GREEN", txRef);
    expect(await policy.totalClaims()).to.equal(1);

    const claim = await policy.getClaimRecord(1);
    expect(claim.payoutAmountInr).to.equal(35000);
    expect(claim.status).to.equal("APPROVED");
  });

  it("retrieves rider claim history", async function () {
    await policy.connect(oracle).logTriggerEvent("HEAVY_RAIN", "mumbai", 6500, 5000, 100, "ipfs://hash");
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("rider_123"));
    const txRef = ethers.keccak256(ethers.toUtf8Bytes("tx_ref"));

    await policy.connect(oracle).logClaim(riderId, 1, 35000, "APPROVED", "GREEN", txRef);
    const claimIds = await policy.getRiderClaimIds(riderId);
    expect(claimIds.length).to.equal(1);
    expect(claimIds[0]).to.equal(1);
  });

  it("logs policy creation", async function () {
    const policyId = ethers.keccak256(ethers.toUtf8Bytes("policy_mongo_id"));
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("rider_mongo_id"));
    await policy.connect(oracle).logPolicy(policyId, riderId, "STANDARD", "mumbai", 202612, 7200);
    expect(await policy.totalPolicies()).to.equal(1);
  });

  it("emits FraudBlocked event for rejected claims", async function () {
    await policy.connect(oracle).logTriggerEvent("HEAVY_RAIN", "mumbai", 6500, 5000, 100, "ipfs://hash");
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("fraud_rider"));
    const txRef = ethers.keccak256(ethers.toUtf8Bytes("none"));
    await expect(
      policy.connect(oracle).logClaim(riderId, 1, 0, "FRAUD_BLOCKED", "RED", txRef)
    ).to.emit(policy, "FraudBlocked").withArgs(riderId, 1, "RED", await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
  });
});

describe("GigShieldLoyaltyPool", function () {
  let pool, oracle, owner;

  beforeEach(async function () {
    [owner, oracle] = await ethers.getSigners();
    const LoyaltyPool = await ethers.getContractFactory("GigShieldLoyaltyPool");
    pool = await LoyaltyPool.deploy(oracle.address);
  });

  it("logs contribution and updates balance", async function () {
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("rider_1"));
    await pool.connect(oracle).logContribution(riderId, 202612, 500);
    const weekPool = await pool.getWeekPool(202612);
    expect(weekPool.balanceInr).to.equal(500);
    expect(weekPool.contributionsCount).to.equal(1);
  });

  it("logs disbursement and reduces balance", async function () {
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("rider_1"));
    const claimRef = ethers.keccak256(ethers.toUtf8Bytes("claim_ref"));
    await pool.connect(oracle).logContribution(riderId, 202612, 1000);
    await pool.connect(oracle).logDisbursement(riderId, 202612, 300, claimRef);
    const weekPool = await pool.getWeekPool(202612);
    expect(weekPool.balanceInr).to.equal(700);
    expect(weekPool.disbursedInr).to.equal(300);
  });

  it("closes week and carries forward to next", async function () {
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("rider_1"));
    await pool.connect(oracle).logContribution(riderId, 202612, 1000);
    await pool.connect(oracle).closeWeek(202612, 300);
    const thisWeek = await pool.getWeekPool(202612);
    expect(thisWeek.isClosed).to.be.true;
    expect(thisWeek.carryForwardInr).to.equal(300);
    const nextWeek = await pool.getWeekPool(202613);
    expect(nextWeek.balanceInr).to.equal(300);
  });

  it("tracks rider lifetime stats", async function () {
    const riderId = ethers.keccak256(ethers.toUtf8Bytes("rider_stats"));
    const claimRef = ethers.keccak256(ethers.toUtf8Bytes("c1"));
    await pool.connect(oracle).logContribution(riderId, 202612, 600);
    await pool.connect(oracle).logDisbursement(riderId, 202612, 400, claimRef);
    const [contributed, received, netImpact] = await pool.getRiderStats(riderId);
    expect(contributed).to.equal(600);
    expect(received).to.equal(400);
  });
});
