// Starts one of the two local servers with the right working directory and
// environment:
//
//   node run.js backend    -> backend-api on http://localhost:5001
//   node run.js frontend   -> Next.js app on http://localhost:3000
//
// The frontend needs NODE_OPTIONS=--openssl-legacy-provider because Next 11's
// webpack uses a hash that newer OpenSSL versions disable (see ../README.md).
const { spawn } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const targets = {
  backend: {
    cwd: path.join(root, "backend-api"),
    command: "node",
    args: ["index.js"],
    env: {},
  },
  frontend: {
    cwd: path.join(root, "project_code"),
    command: "npm",
    args: ["run", "dev"],
    env: { NODE_OPTIONS: "--openssl-legacy-provider" },
  },
};

const target = targets[process.argv[2]];
if (!target) {
  console.error(`Usage: node run.js <${Object.keys(targets).join("|")}>`);
  process.exit(1);
}

// npm is a .cmd shim on Windows, so run the command line through the shell
const child = spawn([target.command, ...target.args].join(" "), {
  cwd: target.cwd,
  env: { ...process.env, ...target.env },
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code === null ? 1 : code));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
