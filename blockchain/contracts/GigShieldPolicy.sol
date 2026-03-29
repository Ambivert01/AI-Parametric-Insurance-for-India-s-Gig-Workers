// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GigShieldPolicy
 * @notice Immutable audit trail for GigShield parametric insurance
 * @dev All payouts and trigger events are logged here for full transparency.
 *      Actual funds move via Razorpay (off-chain) — this contract is the
 *      tamper-proof ledger. Riders can verify their claim on Etherscan.
 */
contract GigShieldPolicy {

    // ─── Structs ──────────────────────────────────────────
    struct TriggerEvent {
        uint256 eventId;
        string  triggerType;     // "HEAVY_RAIN", "AQI_SPIKE", etc.
        string  cityId;          // "mumbai", "delhi", etc.
        uint256 triggerValue;    // value * 100 (e.g., 6500 = 65mm)
        uint256 threshold;       // threshold * 100
        uint256 payoutPercent;   // 60 or 100
        string  dataSourceHash;  // IPFS hash of raw API response
        uint256 timestamp;
        bool    verified;
    }

    struct ClaimRecord {
        uint256 claimId;
        address rider;           // rider's wallet (or address(0) if not on-chain)
        bytes32 offChainRiderId; // hashed MongoDB _id for privacy
        uint256 eventId;
        uint256 payoutAmountInr; // INR amount * 100 (paise)
        uint256 timestamp;
        string  status;          // "APPROVED", "REJECTED", "FRAUD_BLOCKED"
        string  fraudTier;       // "GREEN", "YELLOW", "ORANGE", "RED"
        bytes32 txRef;           // Razorpay transaction reference hash
    }

    struct PolicyRecord {
        bytes32 offChainPolicyId;
        bytes32 offChainRiderId;
        string  tier;
        string  cityId;
        uint256 weekNumber;
        uint256 premiumAmountInr;
        uint256 createdAt;
    }

    // ─── State ────────────────────────────────────────────
    address public immutable oracle;          // GigShield backend oracle address
    address public immutable owner;

    uint256 private _eventCounter;
    uint256 private _claimCounter;
    uint256 private _policyCounter;

    mapping(uint256 => TriggerEvent)  public events;
    mapping(uint256 => ClaimRecord)   public claims;
    mapping(uint256 => PolicyRecord)  public policies;

    // Rider's claim history: hashed rider id → claim ids
    mapping(bytes32 => uint256[]) private _riderClaims;

    // Event-city dedup: prevent double-logging same event
    mapping(bytes32 => bool) private _eventLogged;

    // ─── Events ───────────────────────────────────────────
    event TriggerLogged(
        uint256 indexed eventId,
        string  triggerType,
        string  cityId,
        uint256 triggerValue,
        uint256 timestamp
    );

    event ClaimLogged(
        uint256 indexed claimId,
        bytes32 indexed offChainRiderId,
        uint256 indexed eventId,
        uint256 payoutAmountInr,
        string  status
    );

    event PolicyLogged(
        uint256 indexed policyId,
        bytes32 indexed offChainRiderId,
        string  tier,
        uint256 weekNumber
    );

    event FraudBlocked(
        bytes32 indexed offChainRiderId,
        uint256 eventId,
        string  reason,
        uint256 timestamp
    );

    // ─── Modifiers ────────────────────────────────────────
    modifier onlyOracle() {
        require(msg.sender == oracle, "GigShield: caller is not oracle");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "GigShield: caller is not owner");
        _;
    }

    // ─── Constructor ──────────────────────────────────────
    constructor(address _oracle) {
        require(_oracle != address(0), "Oracle cannot be zero address");
        oracle = _oracle;
        owner = msg.sender;
    }

    // ─── Oracle Functions ─────────────────────────────────

    /**
     * @notice Log a verified parametric trigger event
     * @param triggerType Type of disruption (e.g., "HEAVY_RAIN")
     * @param cityId City where event occurred
     * @param triggerValue Measured value (e.g., 6500 for 65mm rain, scaled ×100)
     * @param threshold Trigger threshold (scaled ×100)
     * @param payoutPercent 60 or 100 (partial or full payout)
     * @param dataSourceHash IPFS hash of raw API data for verification
     */
    function logTriggerEvent(
        string calldata triggerType,
        string calldata cityId,
        uint256 triggerValue,
        uint256 threshold,
        uint256 payoutPercent,
        string calldata dataSourceHash
    ) external onlyOracle returns (uint256) {
        // Dedup: same trigger type + city within 6 hours
        bytes32 dedupKey = keccak256(
            abi.encodePacked(triggerType, cityId, block.timestamp / 21600) // 21600 = 6hr in seconds
        );
        require(!_eventLogged[dedupKey], "GigShield: event already logged for this period");
        _eventLogged[dedupKey] = true;

        _eventCounter++;
        uint256 eventId = _eventCounter;

        events[eventId] = TriggerEvent({
            eventId: eventId,
            triggerType: triggerType,
            cityId: cityId,
            triggerValue: triggerValue,
            threshold: threshold,
            payoutPercent: payoutPercent,
            dataSourceHash: dataSourceHash,
            timestamp: block.timestamp,
            verified: true,
        });

        emit TriggerLogged(eventId, triggerType, cityId, triggerValue, block.timestamp);
        return eventId;
    }

    /**
     * @notice Log a claim decision (approved or rejected)
     * @param offChainRiderId keccak256 hash of MongoDB rider _id (privacy-preserving)
     * @param eventId On-chain event ID
     * @param payoutAmountInr Payout in INR paise (e.g., 35000 = ₹350)
     * @param status "APPROVED", "REJECTED", or "FRAUD_BLOCKED"
     * @param fraudTier "GREEN", "YELLOW", "ORANGE", "RED"
     * @param txRef keccak256 of Razorpay transaction reference
     */
    function logClaim(
        bytes32 offChainRiderId,
        uint256 eventId,
        uint256 payoutAmountInr,
        string calldata status,
        string calldata fraudTier,
        bytes32 txRef
    ) external onlyOracle returns (uint256) {
        require(eventId <= _eventCounter, "GigShield: event does not exist");

        _claimCounter++;
        uint256 claimId = _claimCounter;

        claims[claimId] = ClaimRecord({
            claimId: claimId,
            rider: address(0),      // privacy: no wallet address stored
            offChainRiderId: offChainRiderId,
            eventId: eventId,
            payoutAmountInr: payoutAmountInr,
            timestamp: block.timestamp,
            status: status,
            fraudTier: fraudTier,
            txRef: txRef,
        });

        _riderClaims[offChainRiderId].push(claimId);

        emit ClaimLogged(claimId, offChainRiderId, eventId, payoutAmountInr, status);

        if (keccak256(abi.encodePacked(status)) == keccak256("FRAUD_BLOCKED")) {
            emit FraudBlocked(offChainRiderId, eventId, fraudTier, block.timestamp);
        }

        return claimId;
    }

    /**
     * @notice Log a new weekly policy creation
     */
    function logPolicy(
        bytes32 offChainPolicyId,
        bytes32 offChainRiderId,
        string calldata tier,
        string calldata cityId,
        uint256 weekNumber,
        uint256 premiumAmountInr
    ) external onlyOracle returns (uint256) {
        _policyCounter++;
        uint256 policyId = _policyCounter;

        policies[policyId] = PolicyRecord({
            offChainPolicyId: offChainPolicyId,
            offChainRiderId: offChainRiderId,
            tier: tier,
            cityId: cityId,
            weekNumber: weekNumber,
            premiumAmountInr: premiumAmountInr,
            createdAt: block.timestamp,
        });

        emit PolicyLogged(policyId, offChainRiderId, tier, weekNumber);
        return policyId;
    }

    // ─── View Functions ───────────────────────────────────

    function getRiderClaimIds(bytes32 offChainRiderId)
        external view returns (uint256[] memory) {
        return _riderClaims[offChainRiderId];
    }

    function getTriggerEvent(uint256 eventId)
        external view returns (TriggerEvent memory) {
        return events[eventId];
    }

    function getClaimRecord(uint256 claimId)
        external view returns (ClaimRecord memory) {
        return claims[claimId];
    }

    function totalEvents()  external view returns (uint256) { return _eventCounter; }
    function totalClaims()  external view returns (uint256) { return _claimCounter; }
    function totalPolicies() external view returns (uint256) { return _policyCounter; }
}
