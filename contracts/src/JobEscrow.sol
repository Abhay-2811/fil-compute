// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * EVM escrow for datatzen jobs.
 * Two modes:
 * 1. Balance-based: clients deposit(); Core (signer) calls settleSuccess(user, jobId, attemptId, cuUsed, nodePayout) on job success.
 * 2. Legacy per-job lock: lock(jobId, nodePayout) payable; settleSuccess/refund for that job (no user param).
 */
contract JobEscrow {
    // --- Balance-based escrow (client always pays) ---
    mapping(address => uint256) public balances;
    mapping(bytes32 => bool) public settled; // jobId => settled (balance-based)
    address public signer;

    event Deposited(address indexed user, uint256 amount);
    event SettledFromBalance(bytes32 indexed jobId, address indexed user, uint256 cuUsed, address nodePayout);

    // --- Legacy per-job lock (optional backward compat) ---
    struct Lock {
        address user;
        address nodePayout;
        uint256 amountCu;
        bool settled;
    }
    mapping(bytes32 => Lock) public locks;
    event Locked(bytes32 indexed jobId, address user, address nodePayout, uint256 amountCu);
    event Settled(bytes32 indexed jobId, uint256 cuUsed, address nodePayout);
    event Refunded(bytes32 indexed jobId);

    constructor(address _signer) {
        require(_signer != address(0), "Signer required");
        signer = _signer;
    }

    modifier onlySigner() {
        require(msg.sender == signer, "Not signer");
        _;
    }

    // --- Balance-based: client deposits ---
    function deposit() external payable {
        require(msg.value > 0, "Zero deposit");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function balanceOf(address user) external view returns (uint256) {
        return balances[user];
    }

    /**
     * Core (signer) deducts cuUsed from user's balance and pays node. Only callable when job succeeded.
     */
    function settleSuccess(
        address user,
        bytes32 jobId,
        bytes32 attemptId,
        uint256 cuUsed,
        address payable nodePayout
    ) external onlySigner {
        require(!settled[jobId], "Job already settled");
        require(balances[user] >= cuUsed, "Insufficient balance");
        settled[jobId] = true;
        balances[user] -= cuUsed;
        if (cuUsed > 0 && nodePayout != address(0)) {
            (bool ok,) = nodePayout.call{value: cuUsed}("");
            require(ok, "Transfer to node failed");
        }
        emit SettledFromBalance(jobId, user, cuUsed, nodePayout);
    }

    // --- Legacy per-job lock (optional) ---
    function lock(
        bytes32 jobId,
        address nodePayout
    ) external payable {
        require(locks[jobId].user == address(0), "Job already locked");
        locks[jobId] = Lock({
            user: msg.sender,
            nodePayout: nodePayout,
            amountCu: msg.value,
            settled: false
        });
        emit Locked(jobId, msg.sender, nodePayout, msg.value);
    }

    function settleSuccessLegacy(
        bytes32 jobId,
        bytes32 attemptId,
        uint256 cuUsed,
        address payable nodePayout
    ) external {
        Lock storage l = locks[jobId];
        require(l.user != address(0), "No lock");
        require(!l.settled, "Already settled");
        require(cuUsed <= l.amountCu, "cu_used exceeds lock");
        l.settled = true;
        if (cuUsed > 0) {
            (bool ok,) = nodePayout.call{value: cuUsed}("");
            require(ok, "Transfer to node failed");
        }
        uint256 remainder = l.amountCu - cuUsed;
        if (remainder > 0) {
            (bool ok,) = payable(l.user).call{value: remainder}("");
            require(ok, "Transfer to user failed");
        }
        emit Settled(jobId, cuUsed, nodePayout);
    }

    function refund(bytes32 jobId) external {
        Lock storage l = locks[jobId];
        require(l.user != address(0), "No lock");
        require(!l.settled, "Already settled");
        l.settled = true;
        (bool ok,) = payable(l.user).call{value: l.amountCu}("");
        require(ok, "Refund transfer failed");
        emit Refunded(jobId);
    }
}
