import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./lib/AuthContext";
import { ProtectedRoute } from "./lib/ProtectedRoute";
import { BookingPage } from "./pages/BookingPage";

// The booking funnel is loaded eagerly — it's the conversion-critical path
// and a stranger on mobile data shouldn't wait on a second round trip.
// Everything else is split out so the funnel never carries the landing
// page's animation weight or the dashboard's bulk.
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ManageBookingPage = lazy(() =>
  import("./pages/ManageBookingPage").then((m) => ({ default: m.ManageBookingPage })),
);

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="min-h-screen bg-surface" />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/book/:orgSlug" element={<BookingPage />} />
            {/* The link in a confirmation email. The token is the whole
                authorisation — no account, no session. */}
            <Route path="/appointment/:token" element={<ManageBookingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/dashboard/*"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
