import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import BoxesPage from "./BoxesPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/pokemon/:id" element={<App />} />
        <Route path="/boxes" element={<BoxesPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
