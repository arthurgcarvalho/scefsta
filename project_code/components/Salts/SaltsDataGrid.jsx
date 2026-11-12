import * as React from "react";
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import { useState, useEffect } from "react";
import Popup from "../Popup/Popup";
import RevealBid from "../Popup/RevealBid";
import * as Constants from "../../constants";
import { getAllTenders } from "../../solidityCalls";
import { providers } from "ethers";
const BigNumber = require("bignumber.js");

const columns = [
  { field: "patientId", headerName: "Tender ID", width: 100, sortable: true },
  { field: "bidId", headerName: "Bid ID", width: 75, sortable: true },
  {
    field: "bidVal",
    headerName: "Proposed Bid",
    width: 125,
    sortable: true,
  },
  {
    field: "fullAddress",
    headerName: "Address of Incident",
    width: 375,
    sortable: false,
    resizable: true,
  },
  {
    field: "revealDate",
    headerName: "Reveal Date",
    width: 175,
    sortable: false,
  },
  {
    field: "dueDate",
    headerName: "Due Date",
    width: 175,
    sortable: false,
  },
];

export default function SaltsDataGrid({ accountId }) {
  const [rowPopup, setRowPopup] = useState(false);
  const [tenderID, setTenderID] = useState();
  const [saltVal, setSaltVal] = useState();
  const [proposedBidVal, setProposedBidVal] = useState();
  const [salts, setSalts] = useState();
  const [loading, setLoading] = useState(true);
  const [bidId, setBidId] = useState();
  const [fullAddress, setFullAddress] = useState();

  useEffect(() => {
    const getSalts = async () => {
      const res = await fetch(Constants.getSalts + "?walletId=" + accountId, {
        headers: Constants.HEADERS,
      });
      const data = await res.json();

      // get all the tenders
      const provider = new providers.Web3Provider(window.ethereum);
      const tenderData = await getAllTenders(provider);

      // loop through table data
      for (var i = 0; i < data.length; i++) {
        // loop through tenders
        for (let tender in tenderData) {
          let tendId = new BigNumber(tenderData[tender]["tenderId"]["_hex"]);

          // if the tenderID matches corresponding patientID get the due date
          if (tendId.c[0] + 1 === data[i].patientId) {
            data[i]["revealDate"] = tenderData[tender]["revealDate"];
            data[i]["dueDate"] = tenderData[tender]["dueDate"];
          }
        }

        // change patientId to match tenderId
        data[i]["patientId"]--;
        data[i]["fullAddress"] =
          data[i]["address"] + ", " + data[i]["city"] + ", " + data[i]["state"];
      }

      setSalts(data);
      setLoading(false);
    };

    // if there is no data loaded then get the data
    if (!salts) {
      getSalts();
    }
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ height: 690, width: "100%" }}>
      <DataGrid
        sx={{
          ".MuiTablePagination-displayedRows": {
            "margin-top": "1em",
            "margin-bottom": "1em",
          },
          ".MuiTablePagination-displayedRows, .MuiTablePagination-selectLabel":
            {
              "margin-top": "1em",
              "margin-bottom": "1em",
            },
          boxShadow: 2,
          border: 2,
          borderColor: "#ff8a80",
        }}
        onRowClick={(row) => {
          console.log(row["row"].fullAddress);
          setFullAddress(row["row"].fullAddress);
          setTenderID(row["row"].patientId);
          setProposedBidVal(row["row"].bidVal);
          setBidId(row["row"].bidId);
          setSaltVal(row["row"].saltVal);
          setRowPopup(true);
        }}
        rows={salts}
        getRowId={(row) => row.saltId}
        columns={columns}
        initialState={{
          sorting: {
            sortModel: [{ field: "hospitalSystem", sort: "asc" }],
          },
          pagination: { paginationModel: { pageSize: 10 } },
        }}
        disableDensitySelector
        disableColumnMenu
        density="standard"
        slots={{ toolbar: GridToolbar }}
        componentsProps={{
          toolbar: {
            showQuickFilter: true,
            quickFilterProps: { debounceMs: 500 },
            csvOptions: { disableToolbarButton: true },
            printOptions: { disableToolbarButton: true },
          },
        }}
        pageSize={10}
        checkboxSelection={false}
        autoHeight
      />
      <Popup trigger={rowPopup} setTrigger={setRowPopup}>
        <RevealBid
          tenderId={tenderID}
          bidId={bidId}
          saltVal={saltVal}
          proposedBidVal={proposedBidVal}
          fullAddress={fullAddress}
          setTrigger={setRowPopup}
        />
      </Popup>
    </div>
  );
}
