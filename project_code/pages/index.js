import React from "react";
import TopNavLanding from "../components/TopNavbar/TopNavLanding";
import styles from "../styles/Landing.module.css";
import Hero from "../components/LeadPage/Hero";

const App = () => {
    return (
        <div className={styles.giveFlex}>
            <TopNavLanding />
            <Hero />
        </div>
    )
}
export default App;
