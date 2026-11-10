const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const { createConnection } = require("./db");
const bodyParser = require("body-parser"); // Add this line
const cors = require("cors");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const corsOptions = {
  origin: "http://localhost:3000",
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

const { addAdmin, getAdmins, deleteAdmin } = require("./api/admins");
const {
  addAmbulance,
  getAmbulances,
  deleteAmbulance,
} = require("./api/ambulances");

const {
  addHospital,
  getHospitals,
  deleteHospital,
} = require("./api/hospitals");

const { getPatients, addPatient, updatePatient } = require("./api/patients");

const {
  addPolice,
  getPolice,
  getPoliceType,
  deletePolice,
  addPrivate,
  addInterfacility,
} = require("./api/police");

const { addSalt, getSalts, deleteSalt } = require("./api/salts");

const { getUser } = require("./api/users");

// Signs for the test accounts when DEV_WALLET_KEYS is set (see devWallet.js)
require("./devWallet").registerDevWallet(app);

// Database connection configuration (local SQLite by default, or the original
// MySQL server with DB_DRIVER=mysql; see db.js)
const connection = createConnection();

// Establish the connection
connection.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the database!");

  app.get("/api/admins", async (req, res, next) => {
    return await getAdmins(req, res, connection);
  });

  app.post("/api/admins", async (req, res, next) => {
    return await addAdmin(req, res, connection);
  });

  app.delete("/api/admins", async (req, res, next) => {
    return await deleteAdmin(req, res, connection);
  });

  app.get("/api/ambulances", async (req, res, next) => {
    return await getAmbulances(req, res, connection);
  });

  app.post("/api/ambulances", async (req, res, next) => {
    return await addAmbulance(req, res, connection);
  });

  app.delete("/api/ambulances", async (req, res, next) => {
    return await deleteAmbulance(req, res, connection);
  });

  app.get("/api/hospitals", async (req, res, next) => {
    return await getHospitals(req, res, connection);
  });

  app.post("/api/hospitals", async (req, res, next) => {
    return await addHospital(req, res, connection);
  });

  app.delete("/api/hospitals", async (req, res, next) => {
    return await deleteHospital(req, res, connection);
  });

  app.get("/api/police", async (req, res, next) => {
    if (req.query.walletId) {
      return await getPoliceType(req, res, connection);
    } else {
      return await getPolice(req, res, connection);
    }
  });

  app.post("/api/police", async (req, res, next) => {
    const header = req.headers["x-method"];

    if (header === "emergency") {
      return await addPolice(req, res, connection);
    } else if (header === "private") {
      return await addPrivate(req, res, connection);
    } else if (header === "interfacility") {
      return await addInterfacility(req, res, connection);
    }
  });

  app.delete("/api/police", async (req, res, next) => {
    return await deletePolice(req, res, connection);
  });

  app.get("/api/patients", async (req, res, next) => {
    return await getPatients(req, res, connection);
  });

  app.post("/api/patients", async (req, res, next) => {
    if (req.headers["x-method"] === "insert") {
      return await addPatient(req, res, connection);
    } else {
      return await updatePatient(req, res, connection);
    }
  });

  app.get("/api/salts", async (req, res, next) => {
    return await getSalts(req, res, connection);
  });

  app.post("/api/salts", async (req, res, next) => {
    return await addSalt(req, res, connection);
  });

  app.delete("/api/salts", async (req, res, next) => {
    return await deleteSalt(req, res, connection);
  });

  app.get("/api/users", async (req, res, next) => {
    return await getUser(req, res, connection);
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server is running on this port ${PORT}`));
