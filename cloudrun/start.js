// Starts the whole app in one process group, for a single container:
//
//   backend-api  on 127.0.0.1:5001 (this Node, which has node:sqlite)
//   Next.js app  on $PORT (default 8080), built beforehand with "next build"
//                and run by the old Node that Next 11 needs (WEB_NODE)
//
// The web server forwards /backend/* to the API (see project_code/next.config.js),
// so only $PORT has to be reachable. If either process stops, both stop, and
// the container platform restarts the container.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const WEB_PORT = process.env.PORT || "8080";
const API_PORT = "5001";

// Outside the container, fall back to the Node 17 that project_code installs
const bundledNode = path.join(
  root,
  "project_code",
  "node_modules",
  "node",
  "bin",
  process.platform === "win32" ? "node.exe" : "node"
);
const webNode =
  process.env.WEB_NODE || (fs.existsSync(bundledNode) ? bundledNode : "node");

const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  // give the children a moment, then leave with the first exit code
  setTimeout(() => process.exit(code), 2000).unref();
}

function start(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${name} could not start:`, error);
    stopAll(1);
  });
  child.on("exit", (code) => {
    if (!stopping) console.error(`${name} stopped (exit code ${code})`);
    stopAll(code === null ? 1 : code || 1);
  });
}

start("backend-api", process.execPath, ["index.js"], path.join(root, "backend-api"), {
  PORT: API_PORT,
  NETWORK: process.env.NETWORK || "sepolia",
  DB_DRIVER: process.env.DB_DRIVER || "sqlite",
});

start(
  "web app",
  webNode,
  ["node_modules/next/dist/bin/next", "start", "-p", WEB_PORT],
  path.join(root, "project_code"),
  {
    API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`,
    NEXT_TELEMETRY_DISABLED: "1",
  }
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopAll(0));
}
