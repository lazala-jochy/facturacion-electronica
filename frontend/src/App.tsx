import { useMemo, useState } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import type { AuthCompany } from "./services/auth";

const STORAGE_KEY = "fe_rd_session_company";

function App() {
  const initialCompany = useMemo<AuthCompany | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as AuthCompany;
    } catch {
      return null;
    }
  }, []);

  const [company, setCompany] = useState<AuthCompany | null>(initialCompany);

  const handleAuthenticated = (nextCompany: AuthCompany) => {
    setCompany(nextCompany);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCompany));
  };

  const handleLogout = () => {
    setCompany(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (!company) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return <Dashboard company={company} onLogout={handleLogout} />;
}

export default App;
