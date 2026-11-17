import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@omnibid/api-client-react";

// Use relative /api path on the same origin
setBaseUrl("");

createRoot(document.getElementById("root")!).render(<App />);
