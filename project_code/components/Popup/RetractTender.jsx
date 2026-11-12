import styles from "../../styles/Popup.module.css";
import React from "react";
import Button from "@mui/material/Button";
import { useContractFunction, transactionErrored } from "@usedapp/core";
import DeleteIcon from "@mui/icons-material/Delete";
import Alert from "@mui/material/Alert";
import { CircularProgress } from "@mui/material";
import Box from "@mui/material/Box";
import { AUCTION_INSTANCE } from "../../pages/_app";
import { revertReason } from "../../solidityCalls";
import * as Constants from "../../constants";

export default function RetractTender({ tenderID, setTrigger }) {
  // Obtaining React Hooks from reclaimTender smart contract function
  const { send, state } = useContractFunction(
    AUCTION_INSTANCE,
    "retractTender"
  );

  // When button is clicked, the tender is reclaimed
  const handleRetractTender = () => {
    send(tenderID);
  };

  const finalizeTransaction = async () => {
    const updatePatient = {
      patientId: parseInt(tenderID) + 1,
      status: "retracted",
    };

    let response = await fetch(Constants.getPatients, {
      headers: {
        "x-method": "update",
        "Content-Type": "application/json",
        Origin: Constants.APP_DOMAIN,
      },
      method: "POST",
      body: JSON.stringify(updatePatient),
    });

    let status = await response.json();
    if (status.success) {
      setTrigger(false);
    } else {
      alert(`Error updating patient in DB, contact the SuperAdmin`);
    }
  };

  return (
    <div className={styles.reclaimRetractDiv}>
      <h2>Retract Tender?</h2>
      <Alert severity="info">
        <i>Remember</i>: retracting a tender will allow for the recovery of the
        funds, and will remove the tender from being viewed. A tender can be
        retracted only until its auction end date.
      </Alert>
      <Button onClick={handleRetractTender}>
        <DeleteIcon style={{ fontSize: "36px", color: "red" }} />
      </Button>
      {(function () {
        if (state.status === "Mining") {
          return (
            <Box sx={{ display: "flex" }}>
              <CircularProgress />
            </Box>
          );
        }
        if (transactionErrored(state)) {
          return (
            <div>
              <Alert severity="error">
                Tender retraction failed: {revertReason(state.errorMessage)}
              </Alert>
            </div>
          );
        }
        if (state.status === "Success") {
          return (
            <div>
              <Alert severity="success">
                Your tender was deleted! Please click the button to finalize the
                transaction.
              </Alert>
              <Button color="success" onClick={finalizeTransaction}>
                Finalize and Exit
              </Button>
            </div>
          );
        }
      })()}
    </div>
  );
}
