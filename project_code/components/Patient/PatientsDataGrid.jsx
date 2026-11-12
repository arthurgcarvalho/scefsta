import React from 'react';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useState, useEffect } from 'react';
import Popup from '../Popup/Popup';
import VerifyDelivery from "../Popup/VerifyDelivery";
import { getAllTenders } from "../../solidityCalls";
import { providers } from "ethers";
const BigNumber = require("bignumber.js");

const columns = [
    { field: 'patientId', headerName: 'Patient ID #', width: 175, sortable: true},
    { field: 'injuries', headerName: 'Injuries', width: 200, sortable: true},
    { field: 'mechanismOfInjury', headerName: 'Mechanism', width: 200, sortable: true},
    { field: 'severity', headerName: 'Severity', width: 100, sortable: true},
    { field: "dueDate", headerName: 'Delivery Due', width: 175, sortable: true}
  ];

// when the arrival was confirmed, as recorded by the contract next to the due date
const deliveredColumns = [
    ...columns,
    { field: "deliveryDate", headerName: 'Delivery Confirmed', width: 225, sortable: true}
  ];

/**
 * Creates the table containing the patients information and populates it with the data.
 * @param {*} data JSON containing the data.
 * @param {*} arrival Boolean -if false, a patient has not arrived and the option to confirm their arrival is given
 * @param {*} delivered Boolean -if true, the patients have arrived and the table shows when that was confirmed
 */
export default function PatientsDataGrid({data, arrival, delivered}) {
    // allows for the data in the table to be updated (Add/Remove)
    const [dataContacts, setDataContacts] = useState(data);
    const [rowPopup, setRowPopup] = useState(false);
    const [row, setRow] = useState(0);
   
    // Renames the 'patientId' field to 'id'. DataGrid requires an id field
    dataContacts.map(x => x['id'] = x['patientId'])
 
    // change the popup status
    function performPopup(row) {
        setRowPopup(true);
        setRow(row);
    }

    useEffect(async () => {
        let account = sessionStorage.getItem("accountId");

        let tempData = dataContacts;
        const provider = new providers.Web3Provider(window.ethereum);
        let tempTenders = await getAllTenders(provider);
        console.log("data", tempData);
        console.log("tenders", tempTenders);
        // get data from tenders and map new data
        const mergedPatients = tempData.map((patient) => {
            // if there is no injuries listed set mechanism and injury to N/A
            if (!patient.injuries || patient.injuries === "N/A") {
                patient.injuries = "N/A";
                patient.mechanismOfInjury = "N/A";
            }

            // loop through tenders array
            for (let tender in tempTenders) {
                let tendId = new BigNumber(
                    tempTenders[tender]["tenderId"]["_hex"]);
                
                let allowedHospitals = tempTenders[tender].details.allowedHospitals;
                patient.allowedHospitals = allowedHospitals;

                // if tender ID matches the patient ID
                if (tendId.c[0] + 1 === patient.patientId) {
                    // get the due date
                    patient.dueDate = tempTenders[tender].dueDate;
                    patient.deliveryDate = tempTenders[tender].deliveryDate;
                }
            }
            console.log("merged", patient);
            return patient;
        });

        const filterPatients = mergedPatients.filter((patient) => {
            for (let i = 0; i < patient.allowedHospitals.length; i++) {
                if (patient.allowedHospitals[i] === account) {
                    return true;
                }
            }
            return false;
        })
        
        setDataContacts(filterPatients);
    }, [])

    return (
        <div style={{ height: 400, width: '100%' }}>
            <DataGrid
                sx = {{
                    '.MuiTablePagination-displayedRows': {
                    'margin-top': '1em',
                    'margin-bottom': '1em'
                },
                '.MuiTablePagination-displayedRows, .MuiTablePagination-selectLabel': {
                    'margin-top': '1em',
                    'margin-bottom': '1em'
                },
                
                boxShadow: 2,
                border: 2,
                borderColor: '#ffc400',
                }}
                onRowClick={(row) =>{
                    performPopup(row);
                }}
                rows={dataContacts}
                columns={delivered ? deliveredColumns : columns}
                initialState={{
                    sorting: {
                      sortModel: [{ field: 'username', sort: 'asc' }],
                    },
                    pagination: { paginationModel: { pageSize: 10 } },
                }}
                disableDensitySelector
                disableColumnMenu
                density='standard'
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
                pageSizeOptions={[5, 10, 25]}
                checkboxSelection={false}
                autoHeight
            />
            {(function () {
                if (arrival) {
                    return (
                        <div>
                            <Popup trigger={rowPopup} setTrigger={setRowPopup}>
                                <VerifyDelivery row={row} setTrigger={setRowPopup}></VerifyDelivery>
                            </Popup>
                        </div>
                    )
                }
            })()}
        </div>
        
  );
}