// SisPGeo — Sistema de Pedidos de Geoinformação
// © 2026 2º Sgt Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
// Regras de negócio e contratos: Cap Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer
// Revisão técnica do projeto: Cel Azeredo <azeredo.marcio@eb.mil.br>  ·  Cartographic Engineer

import "@fontsource-variable/inter";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
