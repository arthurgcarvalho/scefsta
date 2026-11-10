// Start Imports
import React from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
} from "@mui/material";
import TopNavbar from "../components/TopNavbar/TopNavbar";
import Sidebar from "../components/SideBar/Sidebar";
import styles from "../styles/About.module.css";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Constants from "../constants";

export default function about() {
  return (
    <div>
      <TopNavbar />
      <div className={styles.collector}>
        <Sidebar />
        <div className={styles.container}>
          <h1>{Constants.PROJECT_NAME}</h1>
          <Image
            src="/AISLogo.png"
            alt={Constants.PROJECT_ABR + " Logo"}
            width="150"
            height="150"
          />
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            # {Constants.PROJECT_NAME}
          </ReactMarkdown>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            # Color Scheme
          </ReactMarkdown>
          <Link
            href="https://www.medicinenet.com/medical_triage_code_tags_and_triage_terminology/views.htm"
            passHref
          >
            <Chip label="Our Source" variant="outlined" />
          </Link>
          <Card sx={{ display: "flex" }} className={styles.colorCard}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: "1 0 auto", textAlign: "left" }}>
                <Typography component="div" variant="h5">
                  Red
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  component="div"
                >
                  Reserved for patients who cannot survive without immediate
                  treatment but who have a chance of survival.
                </Typography>
              </CardContent>
            </Box>
            <Box sx={{ minWidth: "100px", backgroundColor: "red" }}></Box>
          </Card>
          <Card sx={{ display: "flex" }} className={styles.colorCard}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: "1 0 auto", textAlign: "left" }}>
                <Typography component="div" variant="h5">
                  Yellow
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  component="div"
                >
                  Individuals who require attention (and possible later
                  re-triage). These patients are not in any immediate danger of
                  death.
                </Typography>
              </CardContent>
            </Box>
            <Box sx={{ minWidth: "100px", backgroundColor: "yellow" }}></Box>
          </Card>
          <Card sx={{ display: "flex" }} className={styles.colorCard}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: "1 0 auto", textAlign: "left" }}>
                <Typography component="div" variant="h5">
                  Green
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  component="div"
                >
                  People who will need medical care at some point, after more
                  critical injuries have been treated.
                </Typography>
              </CardContent>
            </Box>
            <Box sx={{ minWidth: "100px", backgroundColor: "green" }}></Box>
          </Card>
          <Card sx={{ display: "flex" }} className={styles.colorCard}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: "1 0 auto", textAlign: "left" }}>
                <Typography component="div" variant="h5">
                  Light Blue
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  component="div"
                >
                  This flag is reserved for minor injuries for whom a
                  doctor&lsquo;s care is not required. These are patients that
                  are at a low risk.
                </Typography>
              </CardContent>
            </Box>
            <Box sx={{ minWidth: "100px", backgroundColor: "lightblue" }}></Box>
          </Card>
          <Card sx={{ display: "flex" }} className={styles.colorCard}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flex: "1 0 auto", textAlign: "left" }}>
                <Typography component="div" variant="h5">
                  Black
                </Typography>
                <Typography
                  variant="body1"
                  color="text.secondary"
                  component="div"
                >
                  Color used for the deceased and for individual injuries&lsquo;
                  which are so extensive that they will not be able to survive
                  given the care that is available.
                </Typography>
              </CardContent>
            </Box>
            <Box sx={{ minWidth: "100px", backgroundColor: "black" }}></Box>
          </Card>
        </div>
      </div>
    </div>
  );
}
