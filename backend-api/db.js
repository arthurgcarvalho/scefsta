// Database connection factory.
//
// DB_DRIVER=mysql   -> the original MySQL setup (see ../database-files);
//                      configure with DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
//                      DB_NAME.
// DB_DRIVER=sqlite  -> (default) a local SQLite file, one per deployed
//                      contract, so the app can run on a single machine with
//                      nothing to install. Requires Node.js 22.5+ (built-in
//                      node:sqlite).
//
// Both drivers expose the subset of the mysql2 connection API the routes use:
// connect(cb), query(sql, cb) and promise().query(sql).
const fs = require("fs");
const path = require("path");

const network = () => process.env.NETWORK || "sepolia";

function createMysqlConnection() {
  const mysql = require("mysql2");
  return mysql.createConnection({
    host: process.env.DB_HOST || "ambulance-blockchain.sec.csi.miamioh.edu",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "ais_user",
    password: process.env.DB_PASSWORD || "zebra",
    database: process.env.DB_NAME || "AIS",
  });
}

function currentDeployment() {
  const deploymentsFile = path.join(__dirname, "..", "testnet", "deployments.json");
  if (!fs.existsSync(deploymentsFile)) return null;
  return JSON.parse(fs.readFileSync(deploymentsFile, "utf8"))[network()] || null;
}

// One database file per deployed Auctions contract: patient ids are paired
// with that contract's tender ids, so a redeployment must start from an empty
// database rather than inherit the previous contract's rows.
function sqliteFile() {
  if (process.env.SQLITE_FILE) return process.env.SQLITE_FILE;
  const deployment = currentDeployment();
  const suffix = deployment
    ? "-" + deployment.auctionsAddress.slice(2, 10).toLowerCase()
    : "";
  return path.join(__dirname, "data", `ais-${network()}${suffix}.sqlite`);
}

// The deployer of the contracts is their superAdmin; list it as an admin so
// the Admin dashboard reflects the on-chain state of a fresh deployment.
function seedSuperAdmin(db) {
  const deployment = currentDeployment();
  if (!deployment) return;
  db.prepare(
    `INSERT OR IGNORE INTO Users
       (walletId, firstName, lastName, email, address, city, state, zipcode, accountType)
     VALUES (?, 'Super', 'Admin', 'superadmin@example.com', '1 Example St', 'Sampletown', 'Nevada', 10001, 'admin')`
  ).run(deployment.deployer);
}

class SqliteConnection {
  constructor(file) {
    this.file = file;
    this.db = null;
    // SQLITE_BACKUP_DIR: a directory that outlives the process (on Cloud Run,
    // a mounted storage bucket). The database itself stays on local disk; it
    // is restored from the copy there at start-up and copied back after every
    // change. Only one server instance may use the same directory.
    this.backupFile = process.env.SQLITE_BACKUP_DIR
      ? path.join(process.env.SQLITE_BACKUP_DIR, path.basename(file))
      : null;
  }

  backup() {
    if (!this.backupFile) return;
    try {
      fs.copyFileSync(this.file, this.backupFile);
    } catch (error) {
      console.error(`Could not copy the database to ${this.backupFile}:`, error);
    }
  }

  connect(callback) {
    try {
      const { DatabaseSync } = require("node:sqlite");
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (
        this.backupFile &&
        !fs.existsSync(this.file) &&
        fs.existsSync(this.backupFile)
      ) {
        fs.copyFileSync(this.backupFile, this.file);
        console.log(`Restored the database from ${this.backupFile}`);
      }
      const isNew = !fs.existsSync(this.file);
      this.db = new DatabaseSync(this.file);
      this.db.exec("PRAGMA foreign_keys = ON;");
      if (isNew) {
        this.db.exec(
          fs.readFileSync(path.join(__dirname, "sqlite-schema.sql"), "utf8")
        );
        seedSuperAdmin(this.db);
        this.backup();
      }
      console.log(`Using SQLite database ${this.file}`);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  run(sql) {
    const statement = this.db.prepare(sql);
    if (/^\s*select/i.test(sql)) {
      // plain objects so results serialise exactly like mysql2 rows
      return statement.all().map((row) => ({ ...row }));
    }
    const info = statement.run();
    this.backup();
    return {
      affectedRows: Number(info.changes),
      insertId: Number(info.lastInsertRowid),
    };
  }

  query(sql, callback) {
    let results;
    try {
      results = this.run(sql);
    } catch (error) {
      return callback(error);
    }
    return callback(null, results);
  }

  promise() {
    return {
      query: async (sql) => [this.run(sql), []],
    };
  }
}

function createConnection() {
  const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();
  if (driver === "mysql") return createMysqlConnection();
  if (driver !== "sqlite") throw new Error(`Unknown DB_DRIVER "${driver}"`);
  return new SqliteConnection(sqliteFile());
}

module.exports = { createConnection, sqliteFile, currentDeployment };
