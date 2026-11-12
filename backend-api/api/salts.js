"use strict";
const Constants = require("../api-constants");

async function addSalt(req, res, connection) {
  let walletId = req.body.walletId;
  let patientId = req.body.patientId;
  let bidId = req.body.bidId;
  let saltVal = req.body.saltVal;
  let bidVal = req.body.bidVal;

  // saltVal is the 256-bit nonce as a hexadecimal string and bidVal the bid in
  // wei as a decimal string: both are too large for a number column
  let query = `INSERT INTO ${Constants.Salts} (${Constants.walletId}, ${Constants.patientId}, ${Constants.bidId},
        ${Constants.saltVal}, ${Constants.bidVal})
        VALUES ('${walletId}', '${patientId}', '${bidId}', '${saltVal}', '${bidVal}');`;

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ success: false });
    }

    return res.status(200).json({ data: results, success: true });
  });
}

async function getSalts(req, res, connection) {
  let walletId = req.query.walletId;
  let query = `SELECT *
                FROM ${Constants.Salts}
                LEFT JOIN ${Constants.Patients} ON
                ${Constants.Patients}.${Constants.patientId} = ${Constants.Salts}.${Constants.patientId}
                WHERE ${Constants.walletId} = '${walletId}';`;

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ success: false });
    }

    return res.status(200).json(results);
  });
}

async function deleteSalt(req, res, connection) {
  let walletId = req.body.walletId;
  let patientId = req.body.patientId;
  let bidId = req.body.bidId;

  let query = `DELETE FROM ${Constants.Salts}
                    WHERE ${Constants.walletId} = ${walletId} AND
                    ${Constants.patientId} = ${patientId} AND
                    ${Constants.bidId} = ${bidId};`;

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ success: false });
    }

    return res.status(200).json({ data: results, success: true });
  });
}

module.exports = {
  addSalt,
  getSalts,
  deleteSalt,
};
