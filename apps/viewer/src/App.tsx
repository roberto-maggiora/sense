import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./components/Dashboard";
import DevicesPage from "./components/DevicesPage";
import AlertsPage from "./pages/Alerts";
import DeviceDetails from "./components/DeviceDetails";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/device/:id" element={<DeviceDetails />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

