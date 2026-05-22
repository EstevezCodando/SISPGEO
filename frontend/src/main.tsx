// SisPGeo — Sistema de Pedidos de Geoinformação
// © 2026 Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
// Regras de negócio: Raphael Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./firebase"; // Inicializa Firebase Analytics ao carregar a app
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
