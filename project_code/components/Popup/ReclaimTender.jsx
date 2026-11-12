import styles from "../../styles/Popup.module.css";
import React from "react";
import Button from "@mui/material/Button";
import AssistantDirectionIcon from "@mui/icons-material/AssistantDirection";
import { useContractFunction, transactionErrored } from "@usedapp/core";
import Alert from "@mui/material/Alert";
import { CircularProgress } from "@mui/material";
import Box from "@mui/material/Box";
import { AUCTION_INSTANCE } from "../../pages/_app";
import { revertReason } from "../../solidityCalls";
import * as Constants from "../../constants";

export default function ReclaimTender({ tenderID, setTrigger }) {
  // Obtaining React Hooks from reclaimTender smart contract function
  const { send, state, events } = useContractFunction(
    AUCTION_INSTANCE,
    "reclaimTender"
  );

  // When button is clicked, the tender is reclaimed
  const handleReclaimTender = () => {
    send(tenderID);
  };

  const finalizeTransaction = async () => {
    const updatePatient = {
      patientId: parseInt(tenderID) + 1,
      status: "reclaimed",
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
      <h2>Reclaim Tender?</h2>
      <Alert severity="info">
        <i>Remember</i>: reclaim a tender once a job expires without being
        completed. Your funds will be returned to you.
      </Alert>
      <Button onClick={handleReclaimTender}>
        <AssistantDirectionIcon style={{ fontSize: "36px", color: "gray" }} />
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
                Tender reclaiming failed: {revertReason(state.errorMessage)}
              </Alert>
            </div>
          );
        }
        if (state.status === "Success") {
          return (
            <div>
              <Alert severity="success">
                Your tender was reclaimed! Please click the button to finalize
                the transaction.
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
