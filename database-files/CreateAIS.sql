DROP DATABASE IF EXISTS AIS;
CREATE DATABASE AIS;

USE AIS;

CREATE TABLE Users (
            walletId            VARCHAR(42)    NOT NULL,
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
            initiatorType ENUM('emergency', 'private', 'facility'),
            accountType ENUM('admin', 'initiator', 'facility', 'transport', 'interfacility')     NOT NULL,
            PRIMARY KEY (walletId)
);

CREATE TABLE Patients (
            patientId           INT             NOT NULL AUTO_INCREMENT,
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
            status              ENUM('pending', 'incoming', 'accepted', 'reclaimed', 'retracted')     NOT NULL,
            PRIMARY KEY (patientId)
);

CREATE TABLE Salts (
            saltId int NOT NULL AUTO_INCREMENT,
            walletId VARCHAR(100) NOT NULL,
            patientId int NOT NULL,
            bidId int NOT NULL,
            saltVal VARCHAR(66) NOT NULL,
            bidVal VARCHAR(78) NOT NULL,
            PRIMARY KEY (saltId),
            FOREIGN KEY (walletId) REFERENCES Users(walletId),
            FOREIGN KEY (patientId) REFERENCES Patients(patientId)
);

/*** Default Data ***/
INSERT INTO Users (walletId, firstName, lastName, email, address, city, state, zipcode, accountType, initiatorType)
    VALUES ('0xAd6cacC05493c496b53CCa73AB0ADf0003cB2D80', 'Owen', 'Campbell', 'campbeo2@miamioh.edu', 
    '311 Thatcher Loop', 'Oxford', 'Ohio', 45056, 'admin', 'private');

INSERT INTO Users (walletId, firstName, lastName, email, address, city, state, zipcode, accountType)
    VALUES ('0xEE8fb1E70B2Cd462cC0eE0ABb12B36db6D0932B2', 'Liberty', 'Oliver', 'admin@gmail.com', 
    '107 E Spring St', 'Oxford', 'Ohio', 45056, 'admin');

INSERT INTO Users (walletId, address, city, state, zipcode, facilityName, accountType)
    VALUES ('0x37b17D21569C2cA6c7A078f2283D06BC222F554C', '14W Park Place, Suite C', 'Oxford', 
    'Ohio', 45056, 'Oxford Urgent Care', 'facility');

INSERT INTO Users (walletId, address, city, state, zipcode, policeDept, stationNumber, initiatorType, accountType)
    VALUES ('0xcdF98E3f41A0160360884f67BF8FfF35D92d4E2f', '101 E High St', 'Oxford', 'Ohio', 45056,
     'Oxford Police Dept', '1', 'emergency', 'initiator');

INSERT INTO Users (walletId, firstName, lastName, email, address, city, state, zipcode, initiatorType, accountType)
    VALUES ('0xC53762A6D1E4557Ab363eE38042828fcfBF064bE', 'Sharon', 'Mihalis', 'private@gmail.com', 
    '112 S Poplar St Apt 4', 'Oxford', 'Ohio', 45056, 'private', 'initiator');

INSERT INTO Users (walletId, address, city, state, zipcode, facilityName, initiatorType, accountType)
    VALUES ('0xb153eDE174EDC76EA00D706ce678b3aF28379887', '110 N Poplar St', 'Oxford', 
    'Ohio', 45056, 'McCullough-Hyde Memorial Hospital', 'facility', 'interfacility');

INSERT INTO Users(walletId, address, city, state, zipcode, transportCompany, licensePlate, accountType)
    VALUES ('0x9f8d25e9e3261d328e1Bef34CdbadB9310E451Fc', '311 Thatcher Loop', 'Oxford', 'Ohio', 45056,
    'GoodHealth Transport', 'HHA 6982', 'transport')

/******* Test Data ******/
/* Patients */
-- insert into Patients (address, city, state, zipcode, injuries, mechanismOfInjury, status) values ('71453 Gale Alley', 'Philadelphia', 'Pennsylvania', 41035, 'broken arm', 'car accident', 'reclaimed');

/*
    CREATE USER 'testuser'@'localhost' IDENTIFIED BY 'alpine';
    GRANT ALL PRIVILEGES ON *.* TO 'testuser'@'localhost';  
*/
