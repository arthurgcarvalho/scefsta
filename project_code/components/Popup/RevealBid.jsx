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
import { revertReason } from "../../solidityCalls";
import DetermineWinner from "./DetermineWinner";

/**
 *
 * @param {*} tenderId ID of the tender
 * @param {*} saltVal the secret nonce the bid was sealed with
 * @param {*} proposedBidVal value of the ambulance's bid
 * @returns
 */
export default function RevealBid({
  tenderId,
  saltVal,
  bidId,
  proposedBidVal,
  fullAddress,
  setTrigger,
}) {
  const [bidValue, setBidValue] = React.useState(0);
  // Obtaining React Hooks from revealBid smart contract function
  const { send, state, events } = useContractFunction(
    AUCTION_INSTANCE,
    "revealBid"
  );

  const handlebidValue = (event) => {
    setBidValue(event.target.value);
  };

  // When button is clicked, the bid is revealed
  const handleRevealBid = async () => {
    /**
     * revealBid(tenderId, bidValue, nonce)
     * tenderId - ID of the tender
     * bidValue - wei value of bid
     * nonce - the 256-bit secret the bid was sealed with
     *
     * The contract accepts it only during the reveal period and only if the
     * values reproduce this account's commitment. Nothing is paid.
     */
    send(tenderId, bidValue, saltVal);
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
          <InputLabel htmlFor="filled-adornment-amount">Bid ID:</InputLabel>
          <FilledInput
            id="filled-adornment-amount"
            value={bidId}
            disabled={true}
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
        <i>Remember</i>:{" "}
        <strong>reveal your bid before the reveal period ends.</strong> A bid
        that is not revealed in time cannot win and is recorded as a failed
        reveal; repeated failed reveals suspend your account from bidding. Once
        the reveal period is over, the lowest revealed bid wins.
      </Alert>
      <div className={styles.buttonDiv}>
        <Button variant="contained" onClick={handleRevealBid}>
          Reveal Bid
        </Button>
      </div>
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
                Bid reveal failed: {revertReason(state.errorMessage)}
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
              <Button color="success" onClick={() => setTrigger(false)}>
                Finalize and Exit
              </Button>
            </div>
          );
        }
      })()}
      <div className={styles.buttonDiv}>
        <DetermineWinner
          tenderID={tenderId}
          setTrigger={setTrigger}
          compact={true}
        />
      </div>
    </div>
  );
}
