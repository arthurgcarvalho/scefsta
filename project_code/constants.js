// Project naming
export const PROJECT_ABR = "SCEFSTA";
export const PROJECT_NAME =
  "Smart Contract enabled Fair, Secure, and Transparent Auction";

// Page URLs
export const DevHomeURL = "/home";
export const DevAdminURL = "/admin";
export const DevHospitalURL = "/facility";
export const DevPoliceURL = "/initiator";
export const DevAmbulanceURL = "/transport";
export const DevProfileURL = "/profile";
export const DevAboutURL = "/about";

// Database constansts, used in queries with the database
// table names
export const Users = "Users";
export const Patients = "Patients";
export const Salts = "Salts";

// user table variables
export const walletId = "walletId";
export const firstName = "firstName";
export const lastName = "lastName";
export const email = "email";
export const ipAddress = "ipAddress";
export const username = "username";
export const address = "address";
export const city = "city";
export const state = "state";
export const zipcode = "zipcode";
export const policeDept = "policeDept";
export const station = "stationNumber";
export const hospitalSystem = "facilityName";
export const licensePlate = "licensePlate";
export const initiatorType = "initiatorType";
export const accountType = "accountType";
export const transportCompany = "transportCompany";
export const severity = "severity";

// patient table variables
export const patientId = "patientId";
export const name = "name";
export const gender = "gender";
export const age = "age";
export const status = "status";
export const injuries = "injuries";
export const mech = "mechanismOfInjury";

// salt table variables
export const saltId = "saltId";
export const saltVal = "saltVal";
export const bidId = "bidId";
export const bidVal = "bidVal";

// API URLs. The backend-api server runs locally by default; override with
// NEXT_PUBLIC_API_URL to point at a hosted instance.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
export const getAdmins = API_URL + "/api/admins";
export const getPatients = API_URL + "/api/patients";
export const getPolice = API_URL + "/api/police";
export const getAmbulances = API_URL + "/api/ambulances";
export const getHospitals = API_URL + "/api/hospitals";
export const getTenders = API_URL + "/api/tenders";
export const getSalts = API_URL + "/api/salts";
export const getUsers = API_URL + "/api/users";

export const APP_DOMAIN = "http://localhost:3000";
export const HEADERS = {
  "Content-Type": "application/json",
  Origin: APP_DOMAIN,
};

// Page titles
export const DASHBOARD = "Dashboard";
export const ADMIN = "Admin";
export const ADMIN_PLURAL = "Admins";
export const HOSPITAL = "Facility";
export const HOSPITAL_PLURAL = "Facilities";
export const POLICE = "Initiator";
export const POLICE_PLURAL = "Initiators";
export const AMBULANCE = "Transport";
export const AMBULANCE_PLURAL = "Transports";
export const PATIENT = "Patient";
export const PATIENT_PLURAL = "Patients";
export const TENDER = "Tender";
export const TENDER_PLURAL = "Tenders";

export const PROFILE = "Profile";
export const ABOUT = "About " + PROJECT_ABR;

export const TENDER_STATUS = {
  0: "Closed",
  1: "InProgress",
  2: "Open",
  3: "Retracted",
  4: "Reclaimed",
  5: "Unawarded",
};
