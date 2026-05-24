import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./authContext.jsx";
import { QueryProvider } from "./providers/QueryProvider.jsx";
import { installBootRecovery, installChunkErrorHandlers } from "./lib/bootRecovery.js";
import "./index.css";
import "./styles/premium.css";

installChunkErrorHandlers();

const rootEl = document.getElementById("root");
if (rootEl) {
  rootEl.removeAttribute("style");
}
const root = ReactDOM.createRoot(rootEl);
root.render(
  <BrowserRouter>
    <QueryProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryProvider>
  </BrowserRouter>
);

installBootRecovery();
