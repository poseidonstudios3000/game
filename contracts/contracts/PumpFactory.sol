// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LaunchToken} from "./LaunchToken.sol";

interface IUniswapV2Router02 {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @title PumpFactory
/// @notice pump.fun-style bonding-curve memecoin launchpad using a constant
///         product curve over virtual reserves. 80% of each token's supply is
///         sellable on the curve; on graduation (curve sold out) the raised ETH
///         plus the 20% LP reserve is deployed to a UniswapV2-style DEX and the
///         LP tokens are burned.
/// @dev All rounding favors the protocol: buyers receive floor(tokensOut),
///      sellers receive floor(ethOut), fees round up. The curve invariant
///      k = virtualEth * virtualToken is therefore non-decreasing across trades.
contract PumpFactory is Ownable2Step, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Curve {
        address creator;
        uint128 virtualEth;    // virtual ETH reserve
        uint128 virtualToken;  // virtual token reserve
        uint128 realEth;       // ETH held for this curve (excludes fees)
        uint128 realToken;     // tokens still sellable on the curve
        uint64  createdAt;
        bool    graduated;
        bool    lpDeployed;
    }

    struct TokenMeta {         // name/symbol duplicated from ERC20 for cheap list reads
        string name;
        string symbol;
        string imageUrl;
        string description;
    }

    struct TokenView {         // read helper for the frontend
        address token;
        Curve curve;
        TokenMeta meta;
    }

    // ---------------------------------------------------------------------
    // Constants / immutables
    // ---------------------------------------------------------------------

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant CURVE_SUPPLY = 800_000_000e18;
    uint256 public constant LP_RESERVE = 200_000_000e18;
    uint256 public constant VIRTUAL_TOKEN_START = 1_073_000_000e18;
    uint256 public constant FEE_BPS = 100; // 1%

    uint256 private constant BPS = 10_000;
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint128 public immutable virtualEthStart;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public feeRecipient;
    address public router;

    mapping(address => Curve) private _curves;
    mapping(address => TokenMeta) private _tokenMeta;
    address[] private _tokens;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event TokenCreated(address indexed token, address indexed creator,
                       string name, string symbol, string imageUrl, string description);
    event Trade(address indexed token, address indexed trader, bool isBuy,
                uint256 ethAmount,   // ETH in (buys, pre-fee actually-used) / ETH out (sells, post-fee)
                uint256 tokenAmount,
                uint128 virtualEth, uint128 virtualToken); // post-trade reserves
    event Graduated(address indexed token, uint256 realEth);
    event LiquidityDeployed(address indexed token, address pair,
                            uint256 ethAmount, uint256 tokenAmount);
    event RouterSet(address indexed router);
    event FeeRecipientSet(address indexed feeRecipient);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error UnknownToken();
    error AlreadyGraduated();
    error NotGraduated();
    error AlreadyFinalized();
    error RouterNotSet();
    error ZeroValue();
    error ZeroAmount();
    error SlippageExceeded();
    error InvalidStringLength();
    error ZeroAddress();
    error FeeTransferFailed();
    error EthTransferFailed();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(uint128 virtualEthStart_, address feeRecipient_, address owner_) Ownable(owner_) {
        if (virtualEthStart_ == 0) revert ZeroValue();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        virtualEthStart = virtualEthStart_;
        feeRecipient = feeRecipient_;
    }

    /// @dev Accept ETH refunds from the router during finalizeGraduation
    ///      (UniswapV2 routers refund unused msg.value to the caller).
    receive() external payable {}

    // ---------------------------------------------------------------------
    // Token launch
    // ---------------------------------------------------------------------

    /// @notice Launch a new token with a fresh bonding curve.
    ///         msg.value > 0 performs an initial creator buy on the fresh curve (fee applies).
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUrl,
        string calldata description
    ) external payable nonReentrant returns (address token) {
        uint256 nameLen = bytes(name).length;
        uint256 symbolLen = bytes(symbol).length;
        if (nameLen == 0 || nameLen > 32) revert InvalidStringLength();
        if (symbolLen == 0 || symbolLen > 10) revert InvalidStringLength();
        if (bytes(imageUrl).length > 256) revert InvalidStringLength();
        if (bytes(description).length > 512) revert InvalidStringLength();

        token = address(new LaunchToken(name, symbol, address(this)));

        _curves[token] = Curve({
            creator: msg.sender,
            virtualEth: virtualEthStart,
            virtualToken: SafeCast.toUint128(VIRTUAL_TOKEN_START),
            realEth: 0,
            realToken: SafeCast.toUint128(CURVE_SUPPLY),
            createdAt: uint64(block.timestamp),
            graduated: false,
            lpDeployed: false
        });
        _tokenMeta[token] = TokenMeta({
            name: name,
            symbol: symbol,
            imageUrl: imageUrl,
            description: description
        });
        _tokens.push(token);

        emit TokenCreated(token, msg.sender, name, symbol, imageUrl, description);

        if (msg.value > 0) {
            _buy(token, msg.sender, msg.value, 0);
        }
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    /// @notice Buy tokens with ETH on the bonding curve. 1% fee on the input.
    ///         Partial fill at the graduation boundary: unused ETH is refunded.
    function buy(address token, uint256 minTokensOut)
        external payable nonReentrant returns (uint256 tokensOut)
    {
        Curve storage c = _curves[token];
        if (c.createdAt == 0) revert UnknownToken();
        if (c.graduated) revert AlreadyGraduated();
        if (msg.value == 0) revert ZeroValue();
        tokensOut = _buy(token, msg.sender, msg.value, minTokensOut);
    }

    /// @notice Sell tokens back to the bonding curve for ETH. 1% fee on the output.
    ///         Pulls tokens via transferFrom (requires prior approve).
    function sell(address token, uint256 tokenAmount, uint256 minEthOut)
        external nonReentrant returns (uint256 ethOut)
    {
        Curve storage c = _curves[token];
        if (c.createdAt == 0) revert UnknownToken();
        if (c.graduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert ZeroAmount();

        (uint256 gross, uint256 fee) =
            _quoteSellRaw(c.virtualEth, c.virtualToken, c.realEth, tokenAmount);
        ethOut = gross - fee;
        if (ethOut < minEthOut) revert SlippageExceeded();

        // Effects
        uint128 gross128 = SafeCast.toUint128(gross);
        uint128 amount128 = SafeCast.toUint128(tokenAmount);
        c.virtualEth -= gross128;
        c.virtualToken += amount128;
        c.realEth -= gross128; // capped at realEth in _quoteSellRaw; cannot underflow
        c.realToken += amount128;

        emit Trade(token, msg.sender, false, ethOut, tokenAmount, c.virtualEth, c.virtualToken);

        // Interactions
        // LaunchToken is a vanilla OZ ERC20 (no hooks): reverts on failure.
        LaunchToken(token).transferFrom(msg.sender, address(this), tokenAmount);
        if (fee > 0) {
            (bool feeOk, ) = feeRecipient.call{value: fee}("");
            if (!feeOk) revert FeeTransferFailed();
        }
        if (ethOut > 0) {
            (bool ok, ) = msg.sender.call{value: ethOut}("");
            if (!ok) revert EthTransferFailed();
        }
    }

    /// @dev Shared buy path for buy() and the createToken dev-buy.
    ///      Assumes the curve exists, is not graduated and ethIn > 0.
    function _buy(address token, address buyer, uint256 ethIn, uint256 minTokensOut)
        private returns (uint256 tokensOut)
    {
        Curve storage c = _curves[token];

        (uint256 out, uint256 netUsed, uint256 grossUsed, uint256 fee) =
            _quoteBuyRaw(c.virtualEth, c.virtualToken, c.realToken, ethIn);
        if (out == 0) revert ZeroAmount();
        if (out < minTokensOut) revert SlippageExceeded();
        tokensOut = out;

        // Effects
        uint128 net128 = SafeCast.toUint128(netUsed);
        uint128 out128 = SafeCast.toUint128(out);
        c.virtualEth += net128;
        c.virtualToken -= out128;
        c.realEth += net128;
        c.realToken -= out128;

        bool graduatedNow = c.realToken == 0;
        if (graduatedNow) {
            c.graduated = true;
        }

        emit Trade(token, buyer, true, grossUsed, tokensOut, c.virtualEth, c.virtualToken);
        if (graduatedNow) {
            emit Graduated(token, c.realEth);
        }

        // Interactions
        LaunchToken(token).transfer(buyer, tokensOut);
        if (fee > 0) {
            (bool feeOk, ) = feeRecipient.call{value: fee}("");
            if (!feeOk) revert FeeTransferFailed();
        }
        uint256 refund = ethIn - grossUsed;
        if (refund > 0) {
            (bool ok, ) = buyer.call{value: refund}("");
            if (!ok) revert EthTransferFailed();
        }
    }

    // ---------------------------------------------------------------------
    // Graduation
    // ---------------------------------------------------------------------

    /// @notice Deploy the escrowed ETH + LP reserve of a graduated token to the
    ///         configured UniswapV2-style router and burn the LP tokens.
    ///         Callable by anyone once the owner has set a router.
    function finalizeGraduation(address token) external nonReentrant {
        Curve storage c = _curves[token];
        if (c.createdAt == 0) revert UnknownToken();
        if (!c.graduated) revert NotGraduated();
        if (c.lpDeployed) revert AlreadyFinalized();
        address router_ = router;
        if (router_ == address(0)) revert RouterNotSet();

        uint256 ethAmount = c.realEth;

        // Effects
        c.lpDeployed = true;
        c.realEth = 0;

        // Interactions
        LaunchToken(token).approve(router_, LP_RESERVE);
        // Anyone can pre-create the Uniswap pair and skew its price before
        // finalization; a V2 router then consumes less than desired on one
        // side. 2% minimums bound that leak: a more skewed pool makes this
        // revert (state rolls back, retryable once the pool is arbed back).
        (uint256 amountToken, uint256 amountETH, ) =
            IUniswapV2Router02(router_).addLiquidityETH{value: ethAmount}(
                token,
                LP_RESERVE,
                LP_RESERVE - LP_RESERVE / 50,
                ethAmount - ethAmount / 50,
                DEAD, // LP tokens are burned
                block.timestamp
            );
        LaunchToken(token).approve(router_, 0);
        address pair = IUniswapV2Factory(IUniswapV2Router02(router_).factory())
            .getPair(token, IUniswapV2Router02(router_).WETH());

        emit LiquidityDeployed(token, pair, amountETH, amountToken);
    }

    // ---------------------------------------------------------------------
    // Admin (owner can ONLY set router / fee recipient — no fund withdrawal)
    // ---------------------------------------------------------------------

    function setRouter(address router_) external onlyOwner {
        router = router_;
        emit RouterSet(router_);
    }

    function setFeeRecipient(address r) external onlyOwner {
        if (r == address(0)) revert ZeroAddress();
        feeRecipient = r;
        emit FeeRecipientSet(r);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function quoteBuy(address token, uint256 ethIn)
        external view returns (uint256 tokensOut, uint256 ethUsed, uint256 fee)
    {
        Curve storage c = _curves[token];
        if (c.createdAt == 0) revert UnknownToken();
        if (c.graduated) revert AlreadyGraduated();
        (tokensOut, , ethUsed, fee) = _quoteBuyRaw(c.virtualEth, c.virtualToken, c.realToken, ethIn);
    }

    function quoteSell(address token, uint256 tokenAmount)
        external view returns (uint256 ethOut, uint256 fee)
    {
        Curve storage c = _curves[token];
        if (c.createdAt == 0) revert UnknownToken();
        if (c.graduated) revert AlreadyGraduated();
        uint256 gross;
        (gross, fee) = _quoteSellRaw(c.virtualEth, c.virtualToken, c.realEth, tokenAmount);
        ethOut = gross - fee;
    }

    function tokenCount() external view returns (uint256) {
        return _tokens.length;
    }

    function tokenAt(uint256 i) external view returns (address) {
        return _tokens[i];
    }

    function curves(address token) external view returns (Curve memory) {
        return _curves[token];
    }

    function tokenMeta(address token) external view returns (TokenMeta memory) {
        return _tokenMeta[token];
    }

    function getTokens(uint256 offset, uint256 limit)
        external view returns (TokenView[] memory out)
    {
        uint256 len = _tokens.length;
        if (offset >= len || limit == 0) {
            return new TokenView[](0);
        }
        uint256 end = offset + limit;
        if (end > len) {
            end = len;
        }
        out = new TokenView[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            address t = _tokens[i];
            out[i - offset] = TokenView({token: t, curve: _curves[t], meta: _tokenMeta[t]});
        }
    }

    /// @notice Tokens sold / CURVE_SUPPLY in basis points; 10000 == graduated.
    function progressBps(address token) external view returns (uint256) {
        Curve storage c = _curves[token];
        if (c.createdAt == 0) {
            return 0;
        }
        return ((CURVE_SUPPLY - uint256(c.realToken)) * BPS) / CURVE_SUPPLY;
    }

    // ---------------------------------------------------------------------
    // Curve math (rounding always favors the protocol)
    // ---------------------------------------------------------------------

    /// @dev Buy quote. `fee` rounds up, `tokensOut` rounds down. When the buy
    ///      would cross the graduation boundary it is capped to `realToken`,
    ///      the exact ETH needed is charged (rounded up) and the rest of
    ///      `ethIn` is left for the caller to refund.
    ///      Returns (tokensOut, netUsed, grossUsed, fee) with
    ///      grossUsed = netUsed + fee <= ethIn.
    function _quoteBuyRaw(uint256 vEth, uint256 vToken, uint256 realToken, uint256 ethIn)
        private pure returns (uint256 tokensOut, uint256 netUsed, uint256 grossUsed, uint256 fee)
    {
        fee = Math.ceilDiv(ethIn * FEE_BPS, BPS);
        if (fee > ethIn) {
            fee = ethIn;
        }
        uint256 net = ethIn - fee;
        tokensOut = (vToken * net) / (vEth + net);

        if (tokensOut >= realToken) {
            // Graduation crossing: partial (or exact) fill.
            tokensOut = realToken;
            // Exact ETH into the curve for exactly `realToken` tokens, rounded up.
            netUsed = Math.ceilDiv(vEth * realToken, vToken - realToken);
            // Fee on the used portion so that fee ≈ FEE_BPS of the gross, rounded up.
            fee = Math.ceilDiv(netUsed * FEE_BPS, BPS - FEE_BPS);
            grossUsed = netUsed + fee;
            // For FEE_BPS=100 and ceil-rounded fees, grossUsed <= ethIn always
            // holds; the subtraction in the caller would revert otherwise.
        } else {
            netUsed = net;
            grossUsed = ethIn;
        }
    }

    /// @dev Sell quote. Gross output rounds down and is hard-capped at
    ///      realEth (the invariant guarantees gross <= realEth already);
    ///      the fee rounds up. Returns (gross, fee); ethOut = gross - fee.
    function _quoteSellRaw(uint256 vEth, uint256 vToken, uint256 realEth, uint256 tokenAmount)
        private pure returns (uint256 gross, uint256 fee)
    {
        gross = (vEth * tokenAmount) / (vToken + tokenAmount);
        if (gross > realEth) {
            gross = realEth;
        }
        fee = Math.ceilDiv(gross * FEE_BPS, BPS);
        if (fee > gross) {
            fee = gross;
        }
    }
}
