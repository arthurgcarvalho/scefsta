import styles from "../../styles/Tender.module.css";
import React from "react";
import Button from "@mui/material/Button";
import { useContractFunction, transactionErrored } from "@usedapp/core";
import Alert from "@mui/material/Alert";
import { CircularProgress } from "@mui/material";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FilledInput from "@mui/material/FilledInput";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import { AUCTION_INSTANCE } from "../../pages/_app";
import * as Constants from "../../constants";
import Web3 from "web3";

const web3 = new Web3();

/**
 *
 * @param {*} tenderId ID of the tender
 * @param {*} bidValue value of the ambulance's bid
 * @param {*} penaltyAmt the penalty amount deposited with the bid
 * @returns
 */
export default function RevealBid({
  tenderId,
  penaltyAmt,
  saltVal,
  bidId,
  proposedBidVal,
  fullAddress,
  setTrigger,
}) {
  const [bidValue, setBidValue] = React.useState(0);
  // Obtaining React Hooks from reclaimTender smart contract function
  const { send, state, events } = useContractFunction(
    AUCTION_INSTANCE,
    "revealBid"
  );

  // A bidder who did not win takes the penalty deposit back after the reveal
  // period (the contract refuses it earlier, and for the winner)
  const { send: sendWithdraw, state: withdrawState } = useContractFunction(
    AUCTION_INSTANCE,
    "withdrawDeposit"
  );

  const handlebidValue = (event) => {
    setBidValue(event.target.value);
  };

  // When button is clicked, the tender is reclaimed
  const handleRevealBid = async () => {
    /**
     * revealBid(tenderId, bidValue, salt, bidID)
     * tenderId - ID of the tender
     * bidValue - wei value of bid
     * salt - 10 digit salt (all are 1234567890 for simplicity)
     * bidID - ID of the bid
     *
     * The penalty was already deposited with the sealed bid, so nothing is
     * paid here.
     */
    send(tenderId, bidValue, saltVal, bidId);
  };

  const finalizeTransaction = async () => {
    const updatePatient = {
      patientId: tenderId + 1,
      status: "incoming",
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
    <div className={styles.editHospital}>
      <h2>Bid Reveal</h2>
      <div>
        <FormControl
          fullWidth
          variant="filled"
          className={styles.givenRewardDiv}
        >
          <InputLabel htmlFor="filled-adornment-amount">
            Proposed Bid Amount:
          </InputLabel>
          <FilledInput
            id="filled-adornment-amount"
            value={proposedBidVal}
            startAdornment={
              <InputAdornment position="start">WEI</InputAdornment>
            }
            disabled={true}
          />
        </FormControl>
        <FormControl
          fullWidth
          variant="filled"
          className={styles.givenRewardDiv}
        >
          <InputLabel htmlFor="filled-adornment-amount">
            Penalty Fee:
          </InputLabel>
          <FilledInput
            id="filled-adornment-amount"
            value={penaltyAmt}
            disabled={true}
            startAdornment={
              <InputAdornment position="start">WEI</InputAdornment>
            }
          />
        </FormControl>
      </div>
      <div>
        <FormControl
          fullWidth
          variant="filled"
          className={styles.givenRewardDiv}
        >
          <InputLabel htmlFor="filled-adornment-amount">
            Please re-confirm your bid value:
          </InputLabel>
          <FilledInput
            id="filled-adornment-amount"
            value={bidValue}
            onChange={handlebidValue}
            startAdornment={
              <InputAdornment position="start">WEI</InputAdornment>
            }
          />
        </FormControl>
        <FormControl
          fullWidth
          variant="filled"
          className={styles.givenRewardDiv}
        >
          <InputLabel htmlFor="filled-adornment-amount">
            Pickup Address:
          </InputLabel>
          <FilledInput
            id="filled-adornment-amount"
            value={fullAddress}
            disabled={true}
          />
        </FormControl>
      </div>
      <Alert severity="info">
        <i>Remember</i>: the{" "}
        <strong>
          penalty fee you deposited with this bid is held in escrow.
        </strong>{" "}
        The lowest revealed bid wins. If you win, the deposit is returned with
        your payment when the delivery is confirmed on time. If you do not win,
        withdraw it here once the reveal period is over.
      </Alert>
      <div className={styles.buttonDiv}>
        <Button variant="contained" onClick={handleRevealBid}>
          Reveal Bid
        </Button>{" "}
        <Button variant="outlined" onClick={() => sendWithdraw(tenderId)}>
          Withdraw Deposit
        </Button>
      </div>
      {(function () {
        if (withdrawState.status === "Mining") {
          return (
            <div>
              <Alert severity="warning">
                Waiting for the deposit to be returned
              </Alert>
              <Box sx={{ display: "flex" }}>
                <CircularProgress />
              </Box>
            </div>
          );
        }
        if (transactionErrored(withdrawState)) {
          return (
            <div>
              <Alert severity="error">
                Deposit withdrawal failed:{" "}
                {
                  // show the contract's reason when the wallet reports one
                  (/execution reverted: ([^"\\]+)/.exec(
                    withdrawState.errorMessage || ""
                  ) || [])[1] || withdrawState.errorMessage
                }
              </Alert>
            </div>
          );
        }
        if (withdrawState.status === "Success") {
          return (
            <div>
              <Alert severity="success">
                Your penalty deposit has been returned to your wallet
              </Alert>
            </div>
          );
        }
      })()}
      {(function () {
        if (state.status === "Mining") {
          return (
            <div>
              <Alert severity="warning">Waiting for bid to be revealed</Alert>
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
                Bid reveal failed: {state.errorMessage}
              </Alert>
            </div>
          );
        }
        if (state.status === "Success" && events != undefined) {
          return (
            <div>
              <Alert severity="success">
                Your bid has been revealed, wait until reveal period is over to
                see if you won
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
