// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LaunchToken
/// @notice Minimal fixed-supply ERC20 launched by the PumpFactory.
///         The full supply is minted to `recipient` (the factory) at creation.
///         No owner, no minting, no blacklist — freely transferable.
contract LaunchToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    constructor(
        string memory name,
        string memory symbol,
        address recipient
    ) ERC20(name, symbol) {
        _mint(recipient, TOTAL_SUPPLY);
    }
}
