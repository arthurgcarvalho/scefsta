# Background
This thesis project is an extension of a previous capstone project. The goal of this project is to create competition between EMS companies using blockchain technology. This capstone project will add features and optimize the legacy system created by the other capstone team. The thesis project added several new and novel functionalities such as selecting specific a hospital(s), implementing a penalty function, refined the auction platform, created smart contract testing and diagnostics, and added functional domains to the auction system (Private, Emergency, Inter-facility).

# Vision
SCeFSTA is to provide a transparent way for police stations to deploy ambulances to patients in need, and to reward them appropriately.
Oftentimes, in less developed countries, ambulances don't have any strong incentive to do their jobs efficiently, since the drivers do not always have confidence that they will be paid.
By automating payments to the drivers upon successful delivery of the patients, drivers can be sure that they will be paid upon successful completion of their job.

# Mission
This thesis seeks to build an web application in conjunction with our client to serve the healthcare industry. The goal of this project is to efficiently dispatch scarce resources. We are seeking to understand whether blockchain is part of a practical solution to patient management. We seek to understand the needs of our end-users and provide the most beneficial user interface.

# User Interface
## Video Demo
The [Demo](https://gitlab.csi.miamioh.edu/campbeo2/scefsta/-/blob/main/README_docs/backup-demo.mp4?ref_type=heads) for the SCeFSTA project linked showcases the user interface and auction system of our application. This demo highlights all the major components of the system.

# Technologies utilized 
A wide variety of technologies are utilized throughout this project. The user interface of the application is deployed on NEXT.js, the database for storing user information utilizing mySQL, the backend api is deployed through node, truffle is used to deploy the Ethereum network, Python is used to analyze endpoint data, and Foundry blockchain toolchain is used to test the smart contract functions.

# Project structure
This project has 6 main directories that encompass the entire codebase.

1. backend-api directory
    - This directory holds the code that serves as the interface between the mySQL database and the next app, the backend-api is hosted on node through the ubuntu server that also houses the mysql database (ambulance-blockchain.sec.csi.miamioh.edu). The connections for the api are in the file called index.js and the queries themnselves are specified in the api folder within backend-api. 
    - This API can be ran using the command "node index.js" while inside the ambulance-blockchain remote server inside the backend-api directory.
1. database-files directory
    - This directory holds the mySQL database configuration and deployment script. the CreateAIS.sql file holds the table structure and any initial data in SQL format, and the setupDB.sh file compiles the data and deploys the table to the ubuntu server. 
    - setupDB.sh can be ran using "./setupDB.sh" while in the database-files directory on the ambulance-blockchain remote server.
1. foundry
    - the foundry folder is used to test the smart contracts and get gas price estimations for each smart contract API. This directory utilizes a copy of the smart contracts from the /truffle directory and must be updated independently. More information on the Foundry Blockchain Toolchain can be found at https://github.com/foundry-rs/foundry, as well as their book in the GitHub
1. plots
    - This directory contains code to create API latency boxplots, as well as the box plots for gas prices derived from the /foundry gas reports.
    - More detailed instructions for the gas_time_plotter.py file are included in the /plots directory for compiling the code and getting the data to be compiled.
1. project_code
    - This directory houses the entirety of the NEXT.js application that serves as the user interface. The config.js file at /project_code/config.js holds the smart contract information needed to interface with the deployed smart contract. The /project_code/constants.js code houses many string constants for the application that allows for changing all instances of API calls and naming conventions throughout the app. The /project_code/styles directory has all the css files used in the project, /pages has all of the routable pages inside the application, and the /components directory has any react component that is utilized within the /pages directory or within another react component.
    - More detailed instructions for compiling this code is in the "Installation" section of the README
1. truffle
    - The truffle directory houses the smart contracts that are deployed on the blockchain network that is interfaced by the NEXT.js application in /project_code. The /build directory contains the ABI information that must be copied into the /project_code/config.js file after deploying the smart contract. The /contracts directory houses the smart contracts themselves, and the /test directory holds some smart contract tests as well as the test for smart contract API latency.
    - Instructions on how to deploy the smart contracts with truffle are given below in the "Deploying smart contract" section.

# Running on public testnets
The [testnet](testnet/README.md) directory has scripts to deploy the smart contracts to Ethereum Sepolia, Polygon Amoy and Avalanche Fuji, to check them end to end, and to run the web app and backend API on a single machine against those deployments (no university server, MySQL or local chain needed). The deployed addresses are recorded in [testnet/deployments.json](testnet/deployments.json).

To host the app online (Google Cloud Run, Sepolia), see [cloudrun/README.md](cloudrun/README.md).

# Installation
The following instructions show how to set up and deploy this project

Prepare project for running on local host:
- Clone into your local computer
- Open the project in vs-code or other IDE
- Move into the "project_code" directory
- run command "npm install"
- run command "npm install @usedapp/core"

Set up Metamask (can be done from deployed):
- Download MetaMask extension in chrome
- Create an account and set up Sepolia wallet (under test wallets)
    - Tutorial to add avalanche depending on contract dpeloyment
    - https://docs.alchemy.com/docs/how-to-add-avalanche-to-metamask

Run on localhost: 
- Move into "project_code" directory
- run command "NODE_OPTIONS=--openssl-legacy-provider"
- run command "npm run dev"

# Troubleshooting
- If it says the cache is full, delete .next directory and recompile 
- For openSSL error:(bash) "export NODE_OPTIONS=--openssl-legacy-provider" (windows) "set NODE_OPTIONS=--openssl-legacy-provider"
- If npm install is failing (mac m1 or m2 chip error), look up https://stackoverflow.com/questions/68896696/having-trouble-installing-npm-on-mac-m1
    - need to download nvm and change node version to perform fix above


# Deploying Smart Contract
## Network utilized
The current iteration of this software is deployed on Sepolia, an Ethereum test network. This allows for easy development that is free to use. The network can be changed easily by setting up MetaMask with the desired network, and adding the 

Test network faucets to gain test cryptocurrency
- Ethereum's Sepolia: https://sepoliafaucet.com/
- Avalanche's AVAX: https://faucet.avax.network/

## Tutorial
** Only perform this step if you are the contract owner **
- Setup wallet with metamask & testnet to be used
- Download ganache: sudo npm install -g ganache
- Good links for deploying on Avalanche with Infura:
    - The new contract will be deployed in the truffle directory
    - Tutorial: https://dzone.com/articles/how-to-deploy-an-erc-20-smart-contract-on-avalanch
    - Infura:  https://app.infura.io/dashboard
    - Verify contract: https://testnet.snowtrace.io/
- Once you have deployed the new contract:
    - Add the new contract address to /project_code/config.js and remove the old one
    - Get the contract ABI from /truffle/build (one for Accounts and one for Auctions)
