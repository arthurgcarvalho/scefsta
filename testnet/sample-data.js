// Made-up sample data for test tenders and test users: random street
// addresses, towns, states, zip codes, organisation names and licence plates.
// Nothing here refers to a real place or organisation on purpose; every call
// gives different values.
const { randomInt } = require("crypto");

const STREETS = [
  "Maple", "Cedar", "Willow", "Juniper", "Birch", "Aspen", "Hawthorn",
  "Magnolia", "Sycamore", "Chestnut", "Linden", "Alder", "Larkspur", "Quarry",
  "Meadow", "Orchard", "Harbor", "Ridge", "Foxglove", "Tamarack",
];
const STREET_TYPES = ["St", "Ave", "Rd", "Blvd", "Ln", "Dr", "Way", "Ct"];
const TOWNS = [
  "Riverton", "Brookfield", "Ashford", "Glenwood", "Marlow", "Elmhurst",
  "Stonebridge", "Clearwater", "Northfield", "Westbrook", "Pinehurst",
  "Redfield", "Silverton", "Oakdale", "Millbrook", "Harborview",
];
// the states offered by the app's address form
const STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming",
];
const TRANSPORT_NAMES = [
  "Rapid Response EMS", "Northside Medical Transport", "BlueLine Ambulance",
  "Summit Patient Transfer", "Crestview Ambulance Service", "Beacon EMS",
  "Evergreen Medical Transport", "Keystone Ambulance",
];
const FACILITY_NAMES = [
  "Riverside", "Lakeshore", "Pinecrest", "Unity", "Mercy Hill", "Fairhaven",
  "Cedar Valley", "Highland",
];
const FACILITY_TYPES = ["General Hospital", "Medical Center", "Regional Hospital"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";

const pick = (list) => list[randomInt(list.length)];
const letters = (count) =>
  Array.from({ length: count }, () => LETTERS[randomInt(LETTERS.length)]).join("");

// { address, city, state, zipcode } with zipcode as a 5-digit string
function randomAddress() {
  return {
    address: `${randomInt(1, 9900)} ${pick(STREETS)} ${pick(STREET_TYPES)}`,
    city: pick(TOWNS),
    state: pick(STATES),
    zipcode: String(randomInt(10000, 99999)),
  };
}

const randomSeverity = () => pick(SEVERITIES);

// Users-table columns for a test account of the given kind
// ("initiator" | "transport" | "facility"); taken lists names already in use
// so that two accounts do not get the same organisation.
function randomProfile(kind, taken = []) {
  const place = randomAddress();
  const base = { ...place, zipcode: Number(place.zipcode) };
  const unused = (list) => {
    const free = list.filter((name) => !taken.includes(name));
    return pick(free.length ? free : list);
  };
  if (kind === "initiator") {
    return {
      ...base,
      policeDept: `${place.city} Dispatch Center`,
      stationNumber: String(randomInt(1, 40)),
      initiatorType: "emergency",
      accountType: "initiator",
    };
  }
  if (kind === "transport") {
    return {
      ...base,
      transportCompany: unused(TRANSPORT_NAMES),
      licensePlate: `${letters(3)} ${randomInt(1000, 9999)}`,
      accountType: "transport",
    };
  }
  if (kind === "facility") {
    return {
      ...base,
      facilityName: `${unused(FACILITY_NAMES)} ${pick(FACILITY_TYPES)}`,
      accountType: "facility",
    };
  }
  throw new Error(`No sample profile for "${kind}"`);
}

module.exports = { randomAddress, randomSeverity, randomProfile };
