// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * Minimal EVM escrow for datatzen jobs.
 * Spec: docs/evm-escrow-spec.md
 * - lock(job_id, ...): user locks max_cost_cu for job
 * - settleSuccess(job_id, attempt_id, cu_used, nodePayout): pay node, release rest to user
 * - refund(job_id): full release to user (FAILED_NODE / FAILED_PREFLIGHT)
 */
contract JobEscrow {
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

    function settleSuccess(
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
