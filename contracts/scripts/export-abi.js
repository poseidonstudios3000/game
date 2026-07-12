// Exports the compiled PumpFactory ABI into the frontend's swappable ABI module.
const fs = require("fs");
const path = require("path");
const art = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../artifacts/contracts/PumpFactory.sol/PumpFactory.json"), "utf8")
);
const out =
  "// AUTO-GENERATED from contracts/artifacts/contracts/PumpFactory.sol/PumpFactory.json\n" +
  "// Regenerate after contract changes: (cd contracts && npm run compile && node scripts/export-abi.js)\n" +
  "export const factoryAbi = " + JSON.stringify(art.abi, null, 2) + " as const;\n";
fs.writeFileSync(path.join(__dirname, "../../web/lib/factoryAbi.ts"), out);
console.log("wrote web/lib/factoryAbi.ts with", art.abi.length, "ABI items");
