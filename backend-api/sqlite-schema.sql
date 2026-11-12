-- SQLite translation of ../database-files/CreateAIS.sql (same tables and
-- columns). walletId comparisons are case-insensitive, as they are under
-- MySQL's default collation.

CREATE TABLE Users (
    walletId            VARCHAR(42)     NOT NULL COLLATE NOCASE,
    firstName           VARCHAR(50),
    lastName            VARCHAR(50),
    email               VARCHAR(50),
    address             VARCHAR(50)     NOT NULL,
    city                VARCHAR(50)     NOT NULL,
    state               VARCHAR(50)     NOT NULL,
    zipcode             INT             NOT NULL,
    policeDept          VARCHAR(50),
    stationNumber       VARCHAR(50),
    transportCompany    VARCHAR(100),
    licensePlate        VARCHAR(50),
    facilityName        VARCHAR(100),
    initiatorType       TEXT CHECK (initiatorType IN ('emergency', 'private', 'facility')),
    accountType         TEXT NOT NULL CHECK (accountType IN ('admin', 'initiator', 'facility', 'transport', 'interfacility')),
    PRIMARY KEY (walletId)
);

CREATE TABLE Patients (
    patientId           INTEGER         PRIMARY KEY AUTOINCREMENT,
    name                VARCHAR(50),
    gender              VARCHAR(20),
    age                 INT,
    address             VARCHAR(50)     NOT NULL,
    city                VARCHAR(50)     NOT NULL,
    state               VARCHAR(50)     NOT NULL,
    zipcode             INT             NOT NULL,
    injuries            VARCHAR(200),
    mechanismOfInjury   VARCHAR(50),
    severity            VARCHAR(50),
    status              TEXT NOT NULL CHECK (status IN ('pending', 'incoming', 'accepted', 'reclaimed', 'retracted'))
);

CREATE TABLE Salts (
    saltId      INTEGER         PRIMARY KEY AUTOINCREMENT,
    walletId    VARCHAR(100)    NOT NULL COLLATE NOCASE,
    patientId   INT             NOT NULL,
    bidId       INT             NOT NULL,
    saltVal     VARCHAR(66)     NOT NULL,   -- 256-bit nonce, hexadecimal
    bidVal      VARCHAR(78)     NOT NULL,   -- bid in wei, decimal
    FOREIGN KEY (walletId) REFERENCES Users(walletId),
    FOREIGN KEY (patientId) REFERENCES Patients(patientId)
);

-- No default users: the Accounts contract registers only its deployer (the
-- superAdmin), which db.js adds as an admin when the database is created.
-- Everyone else is added through the Admin page.
