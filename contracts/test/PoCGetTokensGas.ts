import hre from "hardhat";
import { parseEther } from "viem";

const MAX_META = {
  name: "A".repeat(32),
  symbol: "S".repeat(10),
  imageUrl: "https://x.io/" + "i".repeat(243),
  description: "d".repeat(512),
};

describe("PoC: unbounded getTokens gas", function () {
  this.timeout(600000);

  it("measures getTokens gas growth with maxed metadata", async () => {
    const [deployer, feeCollector] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    const factory = await hre.viem.deployContract("PumpFactory", [
      parseEther("1"),
      feeCollector.account.address,
      deployer.account.address,
    ]);

    const N = 240;
    let firstGas = 0n;
    let lastGas = 0n;
    for (let i = 0; i < N; i++) {
      const hash = await factory.write.createToken([
        MAX_META.name,
        MAX_META.symbol,
        MAX_META.imageUrl,
        MAX_META.description,
      ]);
      if (i === 0 || i === N - 1) {
        const rcpt = await publicClient.waitForTransactionReceipt({ hash });
        if (i === 0) firstGas = rcpt.gasUsed;
        else lastGas = rcpt.gasUsed;
      }
    }
    console.log("createToken gas (first):", firstGas.toString());
    console.log("createToken gas (last):", lastGas.toString());

    const samples: Array<[number, bigint]> = [];
    for (const n of [40, 80, 160, 240]) {
      const gas = await publicClient.estimateContractGas({
        address: factory.address,
        abi: factory.abi,
        functionName: "getTokens",
        args: [0n, BigInt(n)],
        account: deployer.account,
      });
      samples.push([n, gas]);
      console.log("getTokens(0," + n + ") estimated gas:", gas.toString());
    }

    // linear slope between the two largest samples
    const [n1, g1] = samples[samples.length - 2];
    const [n2, g2] = samples[samples.length - 1];
    const slope = Number(g2 - g1) / (n2 - n1);
    console.log("marginal gas per token:", slope.toFixed(0));
    console.log(
      "linear-extrapolated gas at 2000 tokens:",
      (Number(g2) + slope * (2000 - n2)).toExponential(3)
    );
    console.log(
      "linear-extrapolated tokens to hit 50M cap:",
      ((50e6 - Number(g2)) / slope + n2).toFixed(0)
    );

    // measure ABI-encoded response size per token
    const data = await factory.read.getTokens([0n, 240n]);
    console.log("tokens returned:", data.length);
  });
});
