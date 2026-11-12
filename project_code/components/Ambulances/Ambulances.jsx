import * as React from "react";
import { useState, useRef } from "react";
import AmbulanceDataGrid from "./AmbulanceDataGrid";
import RevealPolicy from "./RevealPolicy";
import styles from "../../styles/Ambulances.module.css";

/**
 * Creates the main component for holding the table of ambulances. Available in the Contract Administrator page.
 * @param {*} hospitalData JSON data containing ambulance information plus the wallet ID.
 */
export default function Ambulances(amb) {
  // JSON containing data on ambulances
  let ambulances = amb.data;

  // Boolean value that enables/disables pop-ups to edit/delete ambulances
  const popUpChecked = amb.popUpChecked;

  const [searchTerm, setSearchTerm] = useState("");
  const inputEl = useRef("");
  const [searchResults, setSearchResults] = useState([]);

  const searchHandler = (searchTerm) => {
    setSearchTerm(searchTerm);
    if (searchTerm !== "") {
      const newDataList = ambulances.filter((ambulances) => {
        return Object.values(ambulances)
          .join(" ")
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      });
      setSearchResults(newDataList);
    } else {
      setSearchResults(ambulances);
    }
  };

  const getSearchTerm = () => {
    searchHandler(inputEl.current.value);
  };

  return (
    <div className={styles.container}>
      {popUpChecked && <RevealPolicy />}
      {
        <AmbulanceDataGrid
          data={searchTerm.length < 1 ? ambulances : searchResults}
          popUpChecked={popUpChecked}
        ></AmbulanceDataGrid>
      }
    </div>
  );
}
