import { useCall } from "@usedapp/core";
import { auctionsAddress } from "./config";
import { ACCOUNT_INSTANCE, AUCTION_INSTANCE } from "./pages/_app";
import Router from "next/router";
import * as Constants from "./constants";
const BigNumber = require("bignumber.js");

/**
 * Checks if a user is a verified contract administrator
 * @param {*} account Wallet ID
 * @returns
 */
export const checkAdmin = async (account, provider) => {
  try {
    // Create a signer using the provider
    const signer = provider.getSigner();

    // Connect the contract instance to the signer
    const connectedAccountInstance = ACCOUNT_INSTANCE.connect(signer);

    // Call the desired function on the contract instance
    const result = await connectedAccountInstance.isAdmin(account);
    return result;
  } catch (error) {
    console.error("Error:", error);
  }
};

/**
 * Checks if a user is a verified hospital
 * @param {*} account Wallet ID
 * @returns
 */
export const checkHospital = async (account, provider) => {
  try {
    // Create a signer using the provider
    const signer = provider.getSigner();

    // Connect the contract instance to the signer
    const connectedAccountInstance = ACCOUNT_INSTANCE.connect(signer);

    // Call the desired function on the contract instance
    const result = await connectedAccountInstance.isHospital(account);
    return result;
  } catch (error) {
    console.error("Error:", error);
  }
};

/**
 * Checks if user is a verified police entity.
 * @param {*} account Wallet ID
 */
export const checkPolice = async (account, provider) => {
  try {
    // Create a signer using the provider
    const signer = provider.getSigner();

    // Connect the contract instance to the signer
    const connectedAccountInstance = ACCOUNT_INSTANCE.connect(signer);

    // Call the desired function on the contract instance
    const result = await connectedAccountInstance.isInitiator(account);
    return result;
  } catch (error) {
    console.error("Error:", error);
  }
};

/**
 * Checks if user is a verified EMS entity.
 * @param {*} account Wallet ID
 * @returns
 */
export const checkAmbulance = async (account, provider) => {
  try {
    // Create a signer using the provider
    const signer = provider.getSigner();

    // Connect the contract instance to the signer
    const connectedAccountInstance = ACCOUNT_INSTANCE.connect(signer);

    // Call the desired function on the contract instance
    const result = await connectedAccountInstance.isAmbulance(account);
    return result;
  } catch (error) {
    console.error("Error:", error);
  }
};

/**
 * Get all tenders and tender information
 * @returns array of tenders
 */
export const getAllTenders = async (provider) => {
  try {
    // Create a signer using the provider
    const signer = provider.getSigner();

    // Connect the contract instance to the signer
    const connectedAuctionInstance = AUCTION_INSTANCE.connect(signer);

    // Call the desired function on the contract instance
    let tenders = await connectedAuctionInstance.getAllTenders();

    tenders = tenders.map((tender) => {
      const updatedTender = Object.assign({}, tender);

      updatedTender["id"] = new BigNumber(
        tender["tenderId"]["_hex"]
      ).toString();

      // tender details
      updatedTender["walletId"] = tender[0]["tenderPoster"];
      updatedTender["patientLocation"] =
        tender[0]["addr"] +
        ", " +
        tender[0]["city"] +
        ", " +
        tender[0]["state"];
      // get the dates
      var postDate = new Date(
        parseInt(tender[0]["postDate"]["_hex"], 16) * 1000
      );
      var formattedPostDate =
        postDate.toLocaleDateString() + " " + postDate.toLocaleTimeString();
      updatedTender["postDate"] = formattedPostDate;

      var auctionDate = new Date(
        parseInt(tender[0]["auctionDate"]["_hex"], 16) * 1000
      );
      var formattedAuctionDate =
        auctionDate.toLocaleDateString() +
        " " +
        auctionDate.toLocaleTimeString();
      updatedTender["auctionDate"] = formattedAuctionDate;

      var revealDate = new Date(
        parseInt(tender[0]["revealDate"]["_hex"], 16) * 1000
      );
      var formattedRevealDate =
        revealDate.toLocaleDateString() + " " + revealDate.toLocaleTimeString();
      updatedTender["revealDate"] = formattedRevealDate;

      var dueDate = new Date(parseInt(tender[0]["dueDate"]["_hex"], 16) * 1000);
      var formattedDueDate =
        dueDate.toLocaleDateString() + " " + dueDate.toLocaleTimeString();
      updatedTender["dueDate"] = formattedDueDate;

      updatedTender["strStatus"] = Constants.TENDER_STATUS[tender["status"]];

      // When the delivery was confirmed, which the contract records next to
      // the due date: marked as late if it is after the due date, and "Not
      // delivered" if the hirer reclaimed the payment instead.
      const deliveredAt = parseInt(tender[0]["deliveryDate"]["_hex"], 16);
      if (deliveredAt > 0) {
        const deliveryDate = new Date(deliveredAt * 1000);
        updatedTender["deliveryDate"] =
          deliveryDate.toLocaleDateString() +
          " " +
          deliveryDate.toLocaleTimeString() +
          (deliveredAt * 1000 > dueDate.getTime() ? " (late)" : "");
      } else {
        updatedTender["deliveryDate"] =
          updatedTender["strStatus"] === "Reclaimed" ? "Not delivered" : "";
      }
      return updatedTender;
    });
    return tenders;
  } catch (error) {
    console.error("Error:", error);
  }
};

// /**
//  *
//  * @param {*} tenderId
//  * @returns
//  */
// export const getTender = (tenderId) => {
//   const { value, error } =
//     useCall(
//       auctionsAddress && {
//         contract: AUCTION_INSTANCE,
//         method: "getTender",
//         args: [tenderId],
//       }
//     ) ?? {};

//   if (error) {
//     console.error(error.message);
//     return undefined;
//   }
//   return value;
// };

export const getAuctionWinner = async (tenderId, provider) => {
  try {
    // Create a signer using the provider
    const signer = provider.getSigner();

    // Connect the contract instance to the signer
    const connectedAuctionInstance = AUCTION_INSTANCE.connect(signer);

    // Call the desired function on the contract instance
    const result = await connectedAuctionInstance.getAuctionWinner(tenderId);
    return result;
  } catch (error) {
    return false;
  }
};

/**
 * The reveal policy set by the platform's administrators: a provider with
 * `limit` failed reveals within `window` seconds is suspended from bidding
 * for `suspension` seconds.
 */
export const getRevealPolicy = async (provider) => {
  const auctions = AUCTION_INSTANCE.connect(provider);
  const [limit, window, suspension] = await Promise.all([
    auctions.failedRevealLimit(),
    auctions.failedRevealWindow(),
    auctions.suspensionPeriod(),
  ]);
  return {
    limit: limit.toNumber(),
    window: window.toNumber(),
    suspension: suspension.toNumber(),
  };
};

/**
 * When a provider's suspension from bidding ends, as a Unix time in seconds
 * (0: never suspended). Undefined if it could not be read.
 */
export const getSuspendedUntil = async (account, provider) => {
  try {
    const until = await AUCTION_INSTANCE.connect(provider).suspendedUntil(
      account
    );
    return until.toNumber();
  } catch (error) {
    console.error("Error:", error);
  }
};

/**
 * A provider's public record on the Auctions contract: the times (Unix
 * seconds) of its failed reveals, oldest first, and when its suspension ends.
 */
export const getRevealRecord = async (account, provider) => {
  try {
    const auctions = AUCTION_INSTANCE.connect(provider);
    const [failed, until] = await Promise.all([
      auctions.getFailedReveals(account),
      auctions.suspendedUntil(account),
    ]);
    return {
      failedReveals: failed.map((time) => time.toNumber()),
      suspendedUntil: until.toNumber(),
    };
  } catch (error) {
    console.error("Error:", error);
  }
};

/**
 * Every provider's delivery record, from the tenders on the Auctions contract,
 * keyed by the provider's address in lower case: deliveries confirmed by the
 * due date (onTime), confirmed after it (late), and never confirmed, so that
 * the hirer reclaimed the payment (missed).
 */
export const getDeliveryRecords = async (provider) => {
  try {
    const tenders = await AUCTION_INSTANCE.connect(provider).getAllTenders();
    const records = {};
    for (const tender of tenders) {
      const status = Constants.TENDER_STATUS[tender.status];
      if (status !== "Closed" && status !== "Reclaimed") continue;
      const winner = tender.details.tenderAccepter.toLowerCase();
      const record = (records[winner] = records[winner] || {
        onTime: 0,
        late: 0,
        missed: 0,
      });
      if (status === "Reclaimed") {
        record.missed++;
      } else if (tender.details.deliveryDate.gt(tender.details.dueDate)) {
        record.late++;
      } else {
        record.onTime++;
      }
    }
    return records;
  } catch (error) {
    console.error("Error:", error);
    return {};
  }
};

/**
 * The reason a contract gave for rejecting a call ("execution reverted: ..."),
 * when the wallet's error message carries one; otherwise the message itself.
 */
export const revertReason = (message) =>
  (/execution reverted: ([^"\\]+)/.exec(message || "") || [])[1] || message;

export const getPageRoute = (isAdmin, isHospital, isPolice, isAmbulance) => {
  // Use the results of the check functions for further logic
  if (isAdmin) {
    Router.push(Constants.DevAdminURL);
  } else if (isHospital) {
    Router.push(Constants.DevHospitalURL);
  } else if (isPolice) {
    Router.push(Constants.DevPoliceURL);
  } else if (isAmbulance) {
    Router.push(Constants.DevAmbulanceURL);
  } else {
    alert("Wallet is not associated with a valid account, contact an admin");
  }
};
