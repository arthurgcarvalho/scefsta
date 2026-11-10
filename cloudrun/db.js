// Copies the hosted app's database between the storage bucket and this
// machine (backend-api/data), for the Sepolia deployment in
// testnet/deployments.json.
//
//   node cloudrun/db.js pull <gcp-project-id>            bucket -> local file
//   node cloudrun/db.js push <gcp-project-id> [region]   local file -> bucket,
//                                                        then restart the service
//
// The running service keeps its own copy and writes it back to the bucket
// after every change, so "push" restarts the service right after the upload
// to make it load the new file. Anything written through the hosted app
// between a pull and the push is lost; do both in one go, at a quiet moment.
// Stop the local backend before "pull" (it has the local file open).
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const SERVICE = "scefsta";

function gcloud(args) {
  const result = spawnSync(["gcloud", ...args].join(" "), {
    cwd: root,
    shell: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) throw new Error(`gcloud ${args.slice(0, 3).join(" ")} failed`);
}

function main() {
  const [action, project, region = "us-central1"] = process.argv.slice(2);
  if (!["pull", "push"].includes(action) || !project) {
    console.error("Usage: node cloudrun/db.js <pull|push> <gcp-project-id> [region]");
    process.exit(1);
  }
  process.env.NETWORK = "sepolia";
  const localDb = require(path.join(root, "backend-api", "db.js")).sqliteFile();
  const hostedDb = `gs://${project}-${SERVICE}-data/${path.basename(localDb)}`;
  const inProject = `--project=${project}`;

  if (action === "pull") {
    gcloud(["storage", "cp", hostedDb, `"${localDb}"`, inProject]);
    return;
  }
  gcloud(["storage", "cp", `"${localDb}"`, hostedDb, inProject]);
  // a changed setting makes Cloud Run start a fresh container, which loads
  // the database from the bucket
  gcloud([
    "run", "services", "update", SERVICE, inProject, `--region=${region}`,
    `--update-env-vars=DB_LOADED_AT=${Date.now()}`,
  ]);
}

main();
