import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import MealPlan from "@/pages/MealPlan";
import Shopping from "@/pages/Shopping";
import CalendarPage from "@/pages/Calendar";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Chores from "@/pages/Chores";
import Whiteboard from "@/pages/Whiteboard";
import Notebook from "@/pages/Notebook";
import { Loader2 } from "lucide-react";

function Protected({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-amber-400" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/essensplan" element={<Protected><MealPlan /></Protected>} />
            <Route path="/einkaufsliste" element={<Protected><Shopping /></Protected>} />
            <Route path="/kalender" element={<Protected><CalendarPage /></Protected>} />
            <Route path="/haushaltsplan" element={<Protected><Chores /></Protected>} />
            <Route path="/whiteboard" element={<Protected><Whiteboard /></Protected>} />
            <Route path="/notizbuch" element={<Protected><Notebook /></Protected>} />
            <Route path="/profil" element={<Protected><Profile /></Protected>} />
            <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-center" theme="dark" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
