import styles from "../../styles/Popup.module.css";
import React from "react";
import Button from "@mui/material/Button";
import GavelIcon from "@mui/icons-material/Gavel";
import { useContractFunction, transactionErrored } from "@usedapp/core";
import Alert from "@mui/material/Alert";
import { CircularProgress } from "@mui/material";
import Box from "@mui/material/Box";
import { constants } from "ethers";
import { AUCTION_INSTANCE } from "../../pages/_app";
import { revertReason } from "../../solidityCalls";
import * as Constants from "../../constants";

/**
 * Triggers the winner determination of a tender. The contract accepts it from
 * anyone once the reveal period is over: the lowest revealed bid wins, bidders
 * that did not reveal get a failed reveal on their record, and the hirer is
 * refunded if no bid was revealed.
 *
 * @param {*} tenderID ID of the tender
 * @param {*} setTrigger closes the surrounding popup
 * @param {*} compact true: a plain button (inside another popup); false: a
 *            panel with its own heading
 */
export default function DetermineWinner({ tenderID, setTrigger, compact }) {
  const { send, state, events } = useContractFunction(
    AUCTION_INSTANCE,
    "determineWinner"
  );

  const handleDetermineWinner = () => {
    send(tenderID);
  };

  // The outcome is announced in the WinnerDetermined event; the zero address
  // means that no valid bid was revealed.
  const announced = (events || []).find(
    (event) => event.name === "WinnerDetermined"
  );
  const winner = announced ? announced.args.winner : undefined;
  const awarded = winner !== undefined && winner !== constants.AddressZero;

  const finalizeTransaction = async () => {
    const updatePatient = {
      patientId: parseInt(tenderID) + 1,
      // an unawarded tender leaves the lists, like a retracted one
      status: awarded ? "incoming" : "retracted",
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

  const outcome = () => {
    if (!awarded) {
      return "No valid bid was revealed. The tender is closed and the funds were returned to the hirer.";
    }
    const mine =
      (sessionStorage.getItem("accountId") || "").toLowerCase() ===
      winner.toLowerCase();
    return (
      `The lowest revealed bid is ${announced.args.winningBid.toString()} WEI, from ${winner}.` +
      (mine ? " You won the auction! Proceed to pickup patient." : "")
    );
  };

  return (
    <div className={compact ? undefined : styles.reclaimRetractDiv}>
      {!compact && <h2>Determine Winner?</h2>}
      {!compact && (
        <Alert severity="info">
          <i>Remember</i>: once the reveal period is over, anyone can close the
          auction. The lowest revealed bid wins. If no bid was revealed, your
          funds will be returned to you.
        </Alert>
      )}
      {compact ? (
        <Button variant="outlined" onClick={handleDetermineWinner}>
          Determine Winner
        </Button>
      ) : (
        <Button onClick={handleDetermineWinner} aria-label="Determine winner">
          <GavelIcon style={{ fontSize: "36px", color: "#3f88c5" }} />
        </Button>
      )}
      {(function () {
        if (state.status === "Mining") {
          return (
            <div>
              <Alert severity="warning">
                Waiting for the winner to be determined
              </Alert>
              <Box sx={{ display: "flex" }}>
                <CircularProgress />
              </Box>
            </div>
          );
        }
        if (transactionErrored(state)) {
          return (
            <div>
              <Alert severity="error">
                Winner determination failed: {revertReason(state.errorMessage)}
              </Alert>
            </div>
          );
        }
        if (state.status === "Success" && announced) {
          return (
            <div>
              <Alert severity="success">{outcome()}</Alert>
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
