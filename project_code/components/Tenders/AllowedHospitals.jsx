import React, { useState, useEffect } from "react";
import * as Constants from "../../constants";
import stylesP from "../../styles/Popup.module.css";
import HospitalDataGrid from "../Hospitals/HospitalDataGrid";
import { getDistance } from "geolib";
import axios from "axios";

// Optional: without a TomTom key the facility list still loads, but the
// distance / travel-time columns stay empty.
const apiKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY || "YOUR TOMTOM API KEY";

export const AllowedHospitals = ({
  address,
  city,
  state,
  zipcode,
  setAllowedHospitals,
  trigger,
  setTrigger,
  setSelectedData,
}) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [distance, setDistance] = useState(null);
  const [tenderLatitude, setTenderLatitude] = useState(null);
  const [tenderLongitude, setTenderLongitude] = useState(null);
  const [tableData, setTableData] = useState([]);
  const fullAddress = `${address}, ${city}, ${state}, ${zipcode}`;

  const convertAddressToCoordinates = async (address) => {
    try {
      const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(
        address
      )}.json?key=${apiKey}`;
      const response = await axios.get(url);
      const { results } = response.data;
      if (results.length > 0) {
        const { lat, lon } = results[0].position;
        return [lat, lon];
      }
    } catch (error) {
      console.error("Error converting address to coordinates:", error);
    }
  };

  const calculateTravelTime = async (origin, destination) => {
    try {
      const url = `https://api.tomtom.com/routing/1/calculateRoute/${encodeURIComponent(
        origin
      )}:${encodeURIComponent(destination)}/json?key=${apiKey}`;
      const response = await axios.get(url);
      const { routes } = response.data;
      if (routes.length > 0) {
        const { summary } = routes[0];
        return [summary.travelTimeInSeconds, summary.lengthInMeters / 1609.34];
      }
    } catch (error) {
      console.error("Error calculating travel time:", error);
    }
  };

  const fetchHospitals = async () => {
    try {
      const response = await fetch(Constants.getHospitals, {
        headers: Constants.HEADERS,
      });
      const json = await response.json();
      setData(json);
      setTableData(json);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
    convertAddressToCoordinates(fullAddress)
      .then((cords) => {
        setTenderLatitude(cords[0]);
        setTenderLongitude(cords[1]);
      })
      .catch((error) => {
        console.log("Error getting cordinates", error);
      });
  }, []);

  useEffect(() => {
    if (data && data.length > 0 && tenderLatitude && tenderLongitude) {
      const coordinates1 = {
        latitude: tenderLatitude,
        longitude: tenderLongitude,
      };

      for (let i = 0; i < data.length; i++) {
        let tableAddress = `${data[i].address}, ${data[i].city}, ${data[i].state}, ${data[i].zipcode}`;
        convertAddressToCoordinates(tableAddress)
          .then((cords) => {
            const coordinates2 = { latitude: cords[0], longitude: cords[1] };
            calculateTravelTime(
              coordinates1.latitude + "," + coordinates1.longitude,
              coordinates2.latitude + "," + coordinates2.longitude
            )
              .then((res) => {
                let travelTime = Math.round(res[0] / 60);
                let distance = Math.round(res[1]);
                if (distance === 0) {
                  distance = "<1";
                } else if (travelTime === 0) {
                  travelTime = "<1";
                }

                setTableData((prevTableData) => {
                  const updatedTableData = [...prevTableData];
                  updatedTableData[i] = {
                    ...updatedTableData[i],
                    travelTime: travelTime,
                    distance: distance,
                  };
                  return updatedTableData;
                });
              })
              .catch((error) => {
                console.log("Error getting travel time", error);
              });
          })
          .catch((error) => {
            console.log("Error getting cordinates", error);
          });
      }
    }
  }, [data, tenderLatitude, tenderLongitude]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!data) {
    return <div>No data available</div>;
  }

  return (
    <div>
      <div className={stylesP.editHospital}>
        <h1>Allowed {Constants.HOSPITAL}s</h1>
      </div>
      <HospitalDataGrid
        data={tableData}
        popUpChecked={true}
        distances={distance}
        isAllowedHosp={true}
        setAllowedHospitals={setAllowedHospitals}
        setTrigger={setTrigger}
        setSelectedData={setSelectedData}
      />
    </div>
  );
};
