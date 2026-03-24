import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Wrap in a dedicated div to isolate React's DOM tree from
// browser extensions / third-party scripts that inject nodes
// into #root, which causes "removeChild" crashes.
const container = document.getElementById("root")!;
const reactRoot = document.createElement("div");
reactRoot.id = "react-root";
container.appendChild(reactRoot);

createRoot(reactRoot).render(<App />);
