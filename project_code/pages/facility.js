// Start imports
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Tab, Tabs, Typography, Box, CircularProgress } from "@mui/material";
import TopNavbar from "../components/TopNavbar/TopNavbar";
import Sidebar from "../components/SideBar/Sidebar";
import Patients from "../components/Patient/Patients";
import styles from "../styles/Patients.module.css";
import { useEthers } from "@usedapp/core";
import LockIcon from "@mui/icons-material/Lock";
import { Button } from "@mui/material";
import * as Constants from "../constants";
import withMetaMask from "../components/WithMetaMask";
import { getPageRoute } from "../solidityCalls";

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.number.isRequired,
  value: PropTypes.number.isRequired,
};

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}

/**
 * The main Hospital/Healthcare Institution page. Only viewable by this entity.
 * @param {*} accepted JSON object composed of data of accepted patients.
 * @param {*} incoming JSON object composed of data of incoming patients.
 * @param {*} pending JSON object composed of patients that are pending transit.
 */
function Hospital() {
  const [account, setAccount] = useState();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHospital, setIsHospital] = useState(false);
  const [isPolice, setIsPolice] = useState(false);
  const [isAmbulance, setIsAmbulance] = useState(false);
  const [value, setValue] = React.useState(0);
  const [accepted, setAccepted] = useState();
  const [incoming, setIncoming] = useState();
  const [pending, setPending] = useState();


  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  const fetchPatients = async () => {
    try {
      const res = await fetch(Constants.getPatients, {
        headers: Constants.HEADERS,
      });
    const data = await res.json();
    console.log("all patients", data);
    setAccepted(data.filter(function (open) {
      return open.status === "accepted";
    }));

    setIncoming(data.filter(function (open) {
      return open.status === "incoming";
    }));

    setPending(data.filter(function (open) {
      return open.status === "pending"
    }));
    } catch(error) {
      console.error("Error fetching patients", error);
    }
  }

  useEffect(() => {
    fetchPatients();

    setIsAdmin(JSON.parse(sessionStorage.getItem("isAdmin")));
    setIsHospital(JSON.parse(sessionStorage.getItem("isHospital")));
    setIsPolice(JSON.parse(sessionStorage.getItem("isPolice")));
    setIsAmbulance(JSON.parse(sessionStorage.getItem("isAmbulance")));
    setAccount(sessionStorage.getItem("accountId"));
  }, []);

  if (isHospital && pending) {
    return (
      <div>
        <TopNavbar />
        <div className={styles.collector}>
          <Sidebar />
          <div className={styles.patientOverflow}>
            <div className={styles.pageTitle}>
              <h2>{Constants.HOSPITAL_PLURAL}</h2>
            </div>
            <Box sx={{ width: "100%" }}>
              <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                <Tabs
                  value={value}
                  onChange={handleChange}
                  aria-label="basic tabs example"
                >
                  <Tab
                    label="Pending Patients"
                    className={styles.tabText}
                    {...a11yProps(0)}
                  />
                  <Tab
                    label="Incoming Patients"
                    className={styles.tabText}
                    {...a11yProps(1)}
                  />
                    <Tab
                    label="Accepted Patients"
                    className={styles.tabText}
                    {...a11yProps(2)}
                  />
                </Tabs>
              </Box>
              <TabPanel value={value} index={0}>
                <Patients data={pending} arrival={false}/>
              </TabPanel>
              <TabPanel value={value} index={1}>
                <Patients data={incoming} arrival={true} />
              </TabPanel>
              <TabPanel value={value} index={2}>
                <Patients data={accepted} arrival={false} delivered={true} />
              </TabPanel>
            </Box>
          </div>
        </div>
      </div>
    );
  } else if (isHospital == false || (isHospital == undefined && !account)) {
    return (
      <div className={styles.entire}>
        <TopNavbar />
        <div className={styles.collector}>
          <Sidebar />
          <div className={styles.containerLocked}>
            <LockIcon style={{ fontSize: 80, color: "#333" }}></LockIcon>
            <h2 className={styles.headingLocked}>
              You do not have access to this dashboard!
            </h2>
            <Button
              variant="contained"
              style={{ backgroundColor: "#1A588C" }}
              onClick={() => {
                getPageRoute(isAdmin, isHospital, isPolice, isAmbulance);
              }}
            >
              &larr; Return to User{"'"}s Home
            </Button>
          </div>
        </div>
      </div>
    );
  } else {
    return (
      <div className={styles.entire}>
        <TopNavbar />
        <div className={styles.collector}>
          <Sidebar />
          <div className={styles.containerLocked}>
            <CircularProgress />
          </div>
        </div>
      </div>
    );
  }
}

export default withMetaMask(Hospital);
