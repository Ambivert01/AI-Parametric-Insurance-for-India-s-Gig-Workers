// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GigShieldLoyaltyPool
 * @notice Community mutual aid pool — Innovation 2 & 7
 * Unclaimed weekly premiums flow here. During catastrophic events,
 * the pool supplements base payouts giving riders a bonus above base coverage.
 * This makes riders stakeholders in each other's protection.
 */
contract GigShieldLoyaltyPool {

    address public immutable oracle;
    address public immutable owner;

    struct WeeklyPool {
        uint256 weekNumber;
        uint256 balanceInr;           // total INR in pool (tracked off-chain, logged here)
        uint256 contributionsCount;   // number of riders who contributed
        uint256 disbursedInr;         // total disbursed from pool this week
        uint256 beneficiariesCount;
        bool    isClosed;
        uint256 closedAt;
        uint256 carryForwardInr;      // rolled to next week
    }

    struct Contribution {
        bytes32 offChainRiderId;
        uint256 weekNumber;
        uint256 amountInr;
        uint256 timestamp;
    }

    struct Disbursement {
        bytes32 offChainRiderId;
        uint256 weekNumber;
        uint256 bonusInr;
        bytes32 claimRef;             // reference to the underlying claim
        uint256 timestamp;
    }

    mapping(uint256 => WeeklyPool)      public pools;
    mapping(uint256 => Contribution[])  private _weekContributions;
    mapping(uint256 => Disbursement[])  private _weekDisbursements;

    // Rider's lifetime contribution
    mapping(bytes32 => uint256) public riderTotalContributedInr;
    mapping(bytes32 => uint256) public riderTotalReceivedInr;

    uint256 public currentWeek;
    uint256 public globalPoolBalanceInr;

    event ContributionLogged(
        bytes32 indexed offChainRiderId,
        uint256 indexed weekNumber,
        uint256 amountInr
    );

    event BonusDisbursed(
        bytes32 indexed offChainRiderId,
        uint256 indexed weekNumber,
        uint256 bonusInr,
        bytes32 claimRef
    );

    event WeekClosed(
        uint256 indexed weekNumber,
        uint256 totalContributionsInr,
        uint256 totalDisbursedInr,
        uint256 carryForwardInr
    );

    modifier onlyOracle() {
        require(msg.sender == oracle, "LoyaltyPool: not oracle");
        _;
    }

    constructor(address _oracle) {
        oracle = _oracle;
        owner = msg.sender;
    }

    /**
     * @notice Log a rider's contribution to the pool (10% of unclaimed premium)
     */
    function logContribution(
        bytes32 offChainRiderId,
        uint256 weekNumber,
        uint256 amountInr
    ) external onlyOracle {
        WeeklyPool storage pool = pools[weekNumber];
        if (pool.weekNumber == 0) pool.weekNumber = weekNumber;

        pool.balanceInr += amountInr;
        pool.contributionsCount++;
        globalPoolBalanceInr += amountInr;

        riderTotalContributedInr[offChainRiderId] += amountInr;

        _weekContributions[weekNumber].push(Contribution({
            offChainRiderId: offChainRiderId,
            weekNumber: weekNumber,
            amountInr: amountInr,
            timestamp: block.timestamp,
        }));

        emit ContributionLogged(offChainRiderId, weekNumber, amountInr);
    }

    /**
     * @notice Log a pool bonus disbursed to a rider during a catastrophic event
     */
    function logDisbursement(
        bytes32 offChainRiderId,
        uint256 weekNumber,
        uint256 bonusInr,
        bytes32 claimRef
    ) external onlyOracle {
        WeeklyPool storage pool = pools[weekNumber];
        require(!pool.isClosed, "LoyaltyPool: week already closed");
        require(pool.balanceInr >= bonusInr, "LoyaltyPool: insufficient balance");

        pool.balanceInr -= bonusInr;
        pool.disbursedInr += bonusInr;
        pool.beneficiariesCount++;
        globalPoolBalanceInr -= bonusInr;

        riderTotalReceivedInr[offChainRiderId] += bonusInr;

        _weekDisbursements[weekNumber].push(Disbursement({
            offChainRiderId: offChainRiderId,
            weekNumber: weekNumber,
            bonusInr: bonusInr,
            claimRef: claimRef,
            timestamp: block.timestamp,
        }));

        emit BonusDisbursed(offChainRiderId, weekNumber, bonusInr, claimRef);
    }

    /**
     * @notice Close the week and carry forward unused balance
     */
    function closeWeek(uint256 weekNumber, uint256 carryForwardInr) external onlyOracle {
        WeeklyPool storage pool = pools[weekNumber];
        require(!pool.isClosed, "LoyaltyPool: already closed");

        pool.isClosed = true;
        pool.closedAt = block.timestamp;
        pool.carryForwardInr = carryForwardInr;

        // Seed next week with carry-forward
        uint256 nextWeek = weekNumber + 1;
        pools[nextWeek].balanceInr += carryForwardInr;

        emit WeekClosed(weekNumber, pool.contributionsCount, pool.disbursedInr, carryForwardInr);
    }

    // View functions
    function getWeekPool(uint256 weekNumber) external view returns (WeeklyPool memory) {
        return pools[weekNumber];
    }

    function getRiderStats(bytes32 offChainRiderId) external view returns (
        uint256 totalContributed, uint256 totalReceived, uint256 netImpact
    ) {
        totalContributed = riderTotalContributedInr[offChainRiderId];
        totalReceived = riderTotalReceivedInr[offChainRiderId];
        netImpact = totalReceived > totalContributed ? totalReceived - totalContributed : 0;
    }
}
