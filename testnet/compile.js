// Compiles ../truffle/contracts/{Accounts,Auctions}.sol with the same compiler
// settings Truffle used for the committed artifacts (solc 0.8.21, optimizer
// off, evmVersion shanghai), writes ABI + bytecode to ./build and the ABIs the
// web app uses to ../project_code/contractAbis.json.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "..", "truffle", "contracts");
const BUILD_DIR = path.join(__dirname, "build");
// the web app reads its ABIs from this file (see project_code/config.js)
const APP_ABI_FILE = path.join(__dirname, "..", "project_code", "contractAbis.json");
const FILES = ["Accounts.sol", "Auctions.sol"];

function compile() {
  const sources = {};
  for (const file of FILES) {
    sources[file] = {
      content: fs.readFileSync(path.join(CONTRACTS_DIR, file), "utf8"),
    };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: false, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
      },
    },
  };

  const findImports = (importPath) => {
    const file = path.join(CONTRACTS_DIR, path.basename(importPath));
    return fs.existsSync(file)
      ? { contents: fs.readFileSync(file, "utf8") }
      : { error: `File not found: ${importPath}` };
  };

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImports })
  );

  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const artifacts = {};
  for (const file of FILES) {
    const name = path.basename(file, ".sol");
    const contract = output.contracts[file][name];
    artifacts[name] = {
      contractName: name,
      compiler: solc.version(),
      abi: contract.abi,
      bytecode: "0x" + contract.evm.bytecode.object,
      deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
    };
    fs.writeFileSync(
      path.join(BUILD_DIR, `${name}.json`),
      JSON.stringify(artifacts[name], null, 2)
    );
  }
  fs.writeFileSync(
    APP_ABI_FILE,
    JSON.stringify(
      { Accounts: artifacts.Accounts.abi, Auctions: artifacts.Auctions.abi },
      null,
      2
    ) + "\n"
  );
  return artifacts;
}

module.exports = { compile };

if (require.main === module) {
  const artifacts = compile();
  for (const [name, a] of Object.entries(artifacts)) {
    const size = (a.deployedBytecode.length - 2) / 2;
    console.log(`${name}: ${size} bytes of runtime code (${a.compiler})`);
  }
}
