// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev Minimal LP-token-ish pair. Holds the deposited assets and tracks LP
///      balances so tests can assert the LP burn to 0xdead.
contract MockPair {
    string public constant name = "Mock LP";
    string public constant symbol = "MLP";
    uint8 public constant decimals = 18;

    address public immutable router;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    constructor(address router_) {
        router = router_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == router, "MockPair: only router");
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    receive() external payable {}
}

/// @dev Minimal UniswapV2-factory lookalike: createPair + getPair.
contract MockUniswapV2Factory {
    address public immutable router;
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    constructor(address router_) {
        router = router_;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(msg.sender == router, "MockFactory: only router");
        require(getPair[tokenA][tokenB] == address(0), "MockFactory: pair exists");
        pair = address(new MockPair(router));
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
        allPairs.push(pair);
    }
}

contract MockWETH {
    string public constant name = "Mock Wrapped Ether";
    string public constant symbol = "WETH";
}

/// @dev Minimal UniswapV2-router lookalike supporting exactly what
///      PumpFactory.finalizeGraduation needs: factory(), WETH() and
///      addLiquidityETH. Tokens and ETH are moved into the (auto-created)
///      pair and LP tokens are minted to `to`.
contract MockRouter {
    address public immutable factory;
    address public immutable WETH;

    constructor() {
        factory = address(new MockUniswapV2Factory(address(this)));
        WETH = address(new MockWETH());
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        require(deadline >= block.timestamp, "MockRouter: expired");

        MockUniswapV2Factory f = MockUniswapV2Factory(factory);
        address pair = f.getPair(token, WETH);
        if (pair == address(0)) {
            pair = f.createPair(token, WETH);
        }

        amountToken = amountTokenDesired;
        amountETH = msg.value;
        require(amountToken >= amountTokenMin, "MockRouter: token min");
        require(amountETH >= amountETHMin, "MockRouter: eth min");

        require(
            IERC20Minimal(token).transferFrom(msg.sender, pair, amountToken),
            "MockRouter: transferFrom failed"
        );
        (bool ok, ) = pair.call{value: amountETH}("");
        require(ok, "MockRouter: eth transfer failed");

        liquidity = _sqrt(amountToken * amountETH);
        MockPair(payable(pair)).mint(to, liquidity);
    }

    function _sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
