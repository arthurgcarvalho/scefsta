import React, { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import styles from "../../styles/Tender.module.css";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import FilledInput from "@mui/material/FilledInput";
import InputAdornment from "@mui/material/InputAdornment";
import { useContractFunction, transactionErrored } from "@usedapp/core";
import { CircularProgress } from "@mui/material";
import Alert from "@mui/material/Alert";
import { providers, utils } from "ethers";
import { AUCTION_INSTANCE } from "../../pages/_app";
import { getSuspendedUntil, revertReason } from "../../solidityCalls";
import * as Constants from "../../constants";
const BigNumber = require("bignumber.js");

/**
 * The commitment that seals a bid, as the Auctions contract computes it
 * (commitmentOf): a hash over the tender, the bidder, the bid and a secret
 * nonce. It is computed here, in the bidder's browser, so that the bid is
 * shown to nobody before the reveal.
 */
export const sealBid = (tenderId, bidder, bid, nonce) =>
  utils.keccak256(
    utils.defaultAbiCoder.encode(
      ["uint256", "address", "uint256", "uint256"],
      [tenderId, bidder, bid, nonce]
    )
  );

/**
 * Creates bidding form for ambulances.
 * @returns
 */
export default function BiddingForm({ tenderId, setTrigger, auctionEnd }) {
  const [account, setAccount] = useState();
  const [desiredBid, setDesiredBid] = React.useState("");
  const [salt, setSalt] = React.useState();
  const [formError, setFormError] = React.useState();

  // 256 random bits, as a hexadecimal string
  const generateSalt = () => utils.hexlify(utils.randomBytes(32));

  const handleDesiredBid = (event) => {
    setDesiredBid(event.target.value);
  };

  // useDapp hook to place a bid
  const {
    state: state1,
    send: send1,
    events,
  } = useContractFunction(AUCTION_INSTANCE, "secretBid");

  // submit the bid to the blockchain
  const submitBid = async (event) => {
    event.preventDefault();
    setFormError();
    if (!/^[0-9]+$/.test(desiredBid.trim())) {
      setFormError("Please enter the bid as a whole number of WEI");
      return;
    }

    // The commitment is bound to the address that sends it
    const provider = new providers.Web3Provider(window.ethereum);
    const bidder = await provider.getSigner().getAddress();

    // the contract turns suspended providers away; say why beforehand
    const suspendedUntil = await getSuspendedUntil(bidder, provider);
    if (suspendedUntil && suspendedUntil * 1000 > Date.now()) {
      setFormError(
        "This account is suspended from bidding until " +
          new Date(suspendedUntil * 1000).toLocaleString() +
          " because of failed reveals"
      );
      return;
    }

    // generate the secret nonce and seal the bid with it
    let saltVal = generateSalt();
    setSalt(saltVal);
    setAccount(bidder);
    let hash = sealBid(tenderId, bidder, desiredBid.trim(), saltVal);
    send1(tenderId, hash);
  };

  const finalizeTransaction = async (bidId) => {
    // add the salt value to a table
    const newSalt = {
      patientId: parseInt(tenderId) + 1,
      walletId: account,
      saltVal: salt,
      bidId: bidId,
      bidVal: desiredBid.trim(),
    };

    let response = await fetch(Constants.getSalts, {
      method: "POST",
      body: JSON.stringify(newSalt),
      headers: Constants.HEADERS,
    });

    let status = await response.json();
    if (status.success) {
      setTrigger(false);
    } else {
      alert(`Error adding bid to DB, contact the SuperAdmin`);
    }
  };

  useEffect(() => {
    setAccount(sessionStorage.getItem("accountId"));
  }, []);

  return (
    <div className={styles.editHospital}>
      <h2>Place a Bid</h2>
      <div>
        <form onSubmit={submitBid}>
          <FormControl
            fullWidth
            variant="filled"
            className={styles.givenRewardDiv}
            required
          >
            <InputLabel htmlFor="filled-adornment-amount">
              <b>Enter your bid value:</b>
            </InputLabel>
            <FilledInput
              id="filled-adornment-amount"
              value={desiredBid}
              onChange={handleDesiredBid}
              required
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
              <b>Auction End Date</b>
            </InputLabel>
            <FilledInput
              style={{ fontWeight: "bold" }}
              id="filled-adornment-amount"
              value={auctionEnd}
              disabled
            />
          </FormControl>
          <div className={styles.buttonDiv}>
            <Button
              variant="contained"
              disableElevation
              className={styles.submitButton}
              type="submit"
            >
              Submit Bid
            </Button>
          </div>
        </form>
      </div>

      {formError && (
        <div>
          <Alert severity="error">{formError}</Alert>
        </div>
      )}
      {(function () {
        if (state1.status === "Mining") {
          return (
            <div>
              <Alert severity="warning">Waiting for bid to be placed</Alert>
              <Box sx={{ display: "flex" }}>
                <CircularProgress />
              </Box>
            </div>
          );
        }
        if (transactionErrored(state1)) {
          return (
            <div>
              <Alert severity="error">
                Transaction failed: {revertReason(state1.errorMessage)}
              </Alert>
            </div>
          );
        }
        if (state1.status === "Success" && events != undefined) {
          return (
            <div>
              <Alert severity="success">
                Your bid was successfully placed!
              </Alert>
              <Button
                color="success"
                onClick={() => {
                  // Look the event up by name: on networks where ETH transfers
                  // emit their own log (e.g. Sepolia), BidPlaced is not the
                  // first entry in the receipt.
                  const bidPlaced = state1.receipt.events.find(
                    (receiptEvent) => receiptEvent.event === "BidPlaced"
                  );
                  finalizeTransaction(
                    new BigNumber(bidPlaced.args["bidId"]["_hex"]).toString()
                  );
                }}
              >
                Finalize and Exit
              </Button>
            </div>
          );
        }
      })()}
    </div>
  );
}
