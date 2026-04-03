import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { StrictMode } from 'react'
import "./styles/globals.css";
import App from './App.tsx'
import { NotificationProvider } from "./lib/NotificationContext";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <StrictMode>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </StrictMode>
  </BrowserRouter>
)