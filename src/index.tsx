import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import App from "./App";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<StrictMode><App /></StrictMode>);
