import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminPersonDetail } from "./pages/AdminPersonDetail";
import { ManagerLayout } from "./layouts/ManagerLayout";
import { ManagerDashboard } from "./pages/ManagerDashboard";
import { ManagerTeam } from "./pages/ManagerTeam";
import { ManagerTeamMember } from "./pages/ManagerTeamMember";
import { ManagerCalendar } from "./pages/ManagerCalendar";
import { ManagerSettings } from "./pages/ManagerSettings";
import { ManagerAssign } from "./pages/ManagerAssign";
import { ManagerAssignmentDetail } from "./pages/ManagerAssignmentDetail";
import { ManagerCompleted } from "./pages/ManagerCompleted";
import { ManagerRequests } from "./pages/ManagerRequests";
import { ManagerMyManagerDetail } from "./pages/ManagerMyManagerDetail";
import { ManagerMyRequests } from "./pages/ManagerMyRequests";
import { CalendarOAuthCallback } from "./pages/CalendarOAuthCallback";
import { EmployeeLayout } from "./layouts/EmployeeLayout";
import { EmployeeDashboard } from "./pages/EmployeeDashboard";
import { EmployeeTeam } from "./pages/EmployeeTeam";
import { EmployeeCalendar } from "./pages/EmployeeCalendar";
import { EmployeeProfile } from "./pages/EmployeeProfile";
import { EmployeeRequests } from "./pages/EmployeeRequests";
import { EmployeeAssignmentDetail } from "./pages/EmployeeAssignmentDetail";
import { EmployeeManagerDetail } from "./pages/EmployeeManagerDetail";
import "./App.css";

function redirectForRole(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/employee";
}

function ProtectedRoute({ children, role }: { children: React.ReactNode; role: "manager" | "employee" }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={redirectForRole(user.role)} replace />;
  return <>{children}</>;
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to={redirectForRole(user.role)} replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={redirectForRole(user.role)} replace />;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/calendar-oauth-callback" element={<CalendarOAuthCallback />} />
          <Route
            path="/admin"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/people/:uid"
            element={
              <AdminProtectedRoute>
                <AdminPersonDetail />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/manager"
            element={
              <ProtectedRoute role="manager">
                <ManagerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<ManagerDashboard />} />
            <Route path="my-manager" element={<ManagerMyManagerDetail />} />
            <Route path="team" element={<ManagerTeam />} />
            <Route path="team/:uid" element={<ManagerTeamMember />} />
            <Route path="calendar" element={<ManagerCalendar />} />
            <Route path="completed" element={<ManagerCompleted />} />
            <Route path="requests" element={<ManagerRequests />} />
            <Route path="my-requests" element={<ManagerMyRequests />} />
            <Route path="settings" element={<ManagerSettings />} />
            <Route path="assign" element={<ManagerAssign />} />
            <Route path="assignment/:id" element={<ManagerAssignmentDetail />} />
          </Route>
          <Route
            path="/employee"
            element={
              <ProtectedRoute role="employee">
                <EmployeeLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<EmployeeDashboard />} />
            <Route path="manager" element={<EmployeeManagerDetail />} />
            <Route path="team" element={<EmployeeTeam />} />
            <Route path="calendar" element={<EmployeeCalendar />} />
            <Route path="profile" element={<EmployeeProfile />} />
            <Route path="requests" element={<EmployeeRequests />} />
            <Route path="assignment/:id" element={<EmployeeAssignmentDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
