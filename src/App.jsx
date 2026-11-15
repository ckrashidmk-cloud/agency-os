import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import { AdminRoute, CustomerRoute, DefaultLandingRoute, FeatureRoute, StaffRoute } from '@/components/WorkspaceRouteGuard';
import { WorkspaceSettingsProvider } from '@/lib/WorkspaceSettingsContext';
import CustomerLayout from '@/components/CustomerLayout';
// Auth pages
import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AcceptInvitation from '@/pages/AcceptInvitation';
import AcceptCustomerInvitation from '@/pages/AcceptCustomerInvitation';
// App pages
import Dashboard from '@/pages/Dashboard';
import MyDay from '@/pages/MyDay';
import Tasks from '@/pages/Tasks';
import TimeTracking from '@/pages/TimeTracking';
import StatusReports from '@/pages/StatusReports';
import Staff from '@/pages/Staff';
import Clients from '@/pages/Clients';
import Projects from '@/pages/Projects';
import Proposals from '@/pages/Proposals';
import Invoices from '@/pages/Invoices';
import Financials from '@/pages/Financials';
import Workflows from '@/pages/Workflows';
import WorkflowBuilder from '@/pages/WorkflowBuilder';
import BrandingSettings from '@/pages/BrandingSettings';
import ContentCalendar from '@/pages/ContentCalendar';
import Services from '@/pages/Services';
import Targets from '@/pages/Targets';
import Settings from '@/pages/Settings';
import CustomerJobs from '@/pages/CustomerJobs';
import CustomerJobDetail from '@/pages/CustomerJobDetail';
import CustomerProfile from '@/pages/CustomerProfile';
import { isDevelopmentAuthBypass } from "@/lib/supabaseClient";

const AuthenticatedApp = () => (
    <Routes>
      <Route path="/login" element={isDevelopmentAuthBypass ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/auth/callback" element={isDevelopmentAuthBypass ? <Navigate to="/" replace /> : <AuthCallback />} />
      <Route path="/register" element={isDevelopmentAuthBypass ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/forgot-password" element={isDevelopmentAuthBypass ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={isDevelopmentAuthBypass ? <Navigate to="/" replace /> : <ResetPassword />} />
      <Route path="/invite/accept" element={isDevelopmentAuthBypass ? <Navigate to="/" replace /> : <AcceptInvitation />} />
      <Route path="/portal/invite/accept" element={isDevelopmentAuthBypass ? <Navigate to="/" replace /> : <AcceptCustomerInvitation />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<CustomerRoute />}>
          <Route element={<CustomerLayout />}>
            <Route path="/portal/jobs" element={<CustomerJobs />} />
            <Route path="/portal/jobs/:jobId" element={<CustomerJobDetail />} />
            <Route path="/portal/profile" element={<CustomerProfile />} />
          </Route>
        </Route>
        <Route element={<StaffRoute />}>
          <Route element={<Layout />}>
          <Route path="/" element={<DefaultLandingRoute><FeatureRoute feature="dashboard"><Dashboard /></FeatureRoute></DefaultLandingRoute>} />
          <Route path="/my-day" element={<FeatureRoute feature="my-day"><MyDay /></FeatureRoute>} />
          <Route path="/tasks" element={<FeatureRoute feature="tasks"><Tasks /></FeatureRoute>} />
          <Route path="/time" element={<FeatureRoute feature="time"><TimeTracking /></FeatureRoute>} />
          <Route path="/reports" element={<FeatureRoute feature="reports"><StatusReports /></FeatureRoute>} />
          <Route path="/staff" element={<FeatureRoute feature="staff"><Staff /></FeatureRoute>} />
          <Route path="/clients" element={<FeatureRoute feature="clients"><Clients /></FeatureRoute>} />
          <Route path="/projects" element={<FeatureRoute feature="projects"><Projects /></FeatureRoute>} />
          <Route path="/proposals" element={<FeatureRoute feature="proposals"><Proposals /></FeatureRoute>} />
          <Route path="/invoices" element={<FeatureRoute feature="invoices"><Invoices /></FeatureRoute>} />
          <Route path="/financials" element={<FeatureRoute feature="financials"><Financials /></FeatureRoute>} />
          <Route path="/workflows" element={<AdminRoute><FeatureRoute feature="workflows"><Workflows /></FeatureRoute></AdminRoute>} />
          <Route path="/workflows/:id" element={<AdminRoute><FeatureRoute feature="workflows"><WorkflowBuilder /></FeatureRoute></AdminRoute>} />
          <Route path="/branding" element={<AdminRoute><FeatureRoute feature="branding"><BrandingSettings /></FeatureRoute></AdminRoute>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/content-calendar" element={<FeatureRoute feature="content-calendar"><ContentCalendar /></FeatureRoute>} />
          <Route path="/services" element={<FeatureRoute feature="services"><Services /></FeatureRoute>} />
          <Route path="/targets" element={<FeatureRoute feature="targets"><Targets /></FeatureRoute>} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
);

function App() {

  return (
    <AuthProvider>
      <WorkspaceSettingsProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </WorkspaceSettingsProvider>
    </AuthProvider>
  )
}

export default App