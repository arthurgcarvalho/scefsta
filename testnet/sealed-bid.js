// How a bid is sealed, shared by the test and seeding scripts. Same scheme as
// the Dapp (project_code/components/Tenders/BiddingForm.jsx) and as
// Auctions.commitmentOf:
//
//   commitment = keccak256(abi.encode(tenderId, bidder, bid, nonce))
//
// with a 256-bit random nonce. The bidder keeps the bid and the nonce to
// itself until the reveal period.
const { AbiCoder, keccak256, randomBytes, toBigInt } = require("ethers");

function commitmentOf(tenderId, bidder, bid, nonce) {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "uint256", "uint256"],
      [tenderId, bidder, bid, nonce]
    )
  );
}

function sealedBid(tenderId, bidder, bid) {
  const nonce = toBigInt(randomBytes(32));
  return { bid, nonce, commitment: commitmentOf(tenderId, bidder, bid, nonce) };
}

// the nonce as the Dapp stores and shows it: 32 bytes in hexadecimal
const nonceToHex = (nonce) => "0x" + nonce.toString(16).padStart(64, "0");

module.exports = { commitmentOf, sealedBid, nonceToHex };
