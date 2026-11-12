import * as React from "react";
import { useState, useEffect } from "react";
import { Button, TextField } from "@mui/material";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import { CircularProgress } from "@mui/material";
import { useContractFunction, transactionErrored } from "@usedapp/core";
import { providers } from "ethers";
import { AUCTION_INSTANCE } from "../../pages/_app";
import { getRevealPolicy } from "../../solidityCalls";
import * as Constants from "../../constants";

const HOUR = 3600;
// seconds on chain, hours on screen
const toHours = (seconds) =>
  String(Math.round((seconds / HOUR) * 10000) / 10000);
const isCount = (text) => /^[1-9][0-9]*$/.test(String(text).trim());
const isHours = (text) => /^[0-9]+(\.[0-9]+)?$/.test(String(text).trim());

/**
 * The rule that suspends providers which do not reveal their bids, as stored
 * in the Auctions contract, with a form for admins to change it: a provider
 * with `limit` failed reveals within the rolling period is suspended from
 * bidding for the suspension length.
 */
export default function RevealPolicy() {
  const [limit, setLimit] = useState("");
  const [windowHours, setWindowHours] = useState("");
  const [suspensionHours, setSuspensionHours] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { send, state } = useContractFunction(
    AUCTION_INSTANCE,
    "setRevealPolicy"
  );

  useEffect(() => {
    const load = async () => {
      try {
        const provider = new providers.Web3Provider(window.ethereum);
        const policy = await getRevealPolicy(provider);
        setLimit(String(policy.limit));
        setWindowHours(toHours(policy.window));
        setSuspensionHours(toHours(policy.suspension));
        setLoaded(true);
      } catch (error) {
        console.error("Error reading the reveal policy", error);
      }
    };
    load();
  }, []);

  const valid =
    isCount(limit) && isHours(windowHours) && isHours(suspensionHours);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!valid) return;
    send(
      limit.trim(),
      Math.round(Number(windowHours) * HOUR),
      Math.round(Number(suspensionHours) * HOUR)
    );
  };

  if (!loaded) {
    return null;
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        border: 2,
        borderColor: "#82b1ff",
        boxShadow: 2,
        borderRadius: 1,
        p: 2,
        mb: 2,
      }}
    >
      <strong>Failed-reveal rule</strong>
      <div style={{ marginBottom: "0.75rem" }}>
        A {Constants.AMBULANCE.toLowerCase()} that does not reveal a bid it
        placed gets a failed reveal on its record. Reaching the number of
        failed reveals below within the rolling period suspends it from bidding.
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1.5rem",
          alignItems: "flex-end",
        }}
      >
        <TextField
          type="text"
          name="limit"
          label="Failed reveals"
          variant="standard"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          error={!isCount(limit)}
          helperText={!isCount(limit) && "A whole number, at least 1"}
        />
        <TextField
          type="text"
          name="window"
          label="Rolling period (hours)"
          variant="standard"
          value={windowHours}
          onChange={(event) => setWindowHours(event.target.value)}
          error={!isHours(windowHours)}
          helperText={!isHours(windowHours) && "A number of hours"}
        />
        <TextField
          type="text"
          name="suspension"
          label="Suspension (hours)"
          variant="standard"
          value={suspensionHours}
          onChange={(event) => setSuspensionHours(event.target.value)}
          error={!isHours(suspensionHours)}
          helperText={!isHours(suspensionHours) && "A number of hours"}
        />
        <Button type="submit" variant="outlined" disabled={!valid}>
          Update Rule
        </Button>
      </div>
      {(function () {
        if (state.status === "Mining") {
          return (
            <div>
              <Alert severity="warning">Waiting for the rule to be updated</Alert>
              <Box sx={{ display: "flex" }}>
                <CircularProgress />
              </Box>
            </div>
          );
        }
        if (transactionErrored(state)) {
          return (
            <Alert severity="error">
              Transaction failed: {state.errorMessage}
            </Alert>
          );
        }
        if (state.status === "Success") {
          return (
            <Alert severity="success">
              The rule was updated. It applies to failed reveals recorded from
              now on.
            </Alert>
          );
        }
      })()}
    </Box>
  );
}
