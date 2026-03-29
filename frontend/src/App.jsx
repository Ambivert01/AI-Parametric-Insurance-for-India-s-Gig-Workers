import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Provider, useSelector } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store, selectAuth } from './store/index';
import { useSocket } from './hooks/useSocket';
import AppLayout from './components/shared/AppLayout';
import AuthPage from './pages/auth/AuthPage';
import RiderDashboard from './pages/rider/RiderDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import { lazy, Suspense } from 'react';

const PolicyPage = lazy(() => import('./pages/rider/PolicyPage'));
const ClaimsPage = lazy(() => import('./pages/rider/ClaimsPage'));
const ClaimDetailPage = lazy(() => import('./pages/rider/ClaimDetailPage'));
const PaymentsPage = lazy(() => import('./pages/rider/PaymentsPageImpl'));
const CommunityPage = lazy(() => import('./pages/rider/CommunityPage'));
const ProfilePage = lazy(() => import('./pages/rider/ProfilePage'));
const AdminClaimsPage = lazy(() => import('./pages/admin/AdminClaimsPage'));
const AdminRidersPage = lazy(() => import('./pages/admin/AdminRidersPage'));
const AdminFraudPage = lazy(() => import('./pages/admin/AdminFraudPage'));
const AdminMapPage = lazy(() => import('./pages/admin/AdminMapPage'));
const AdminPoolPage = lazy(() => import('./pages/admin/AdminPoolPage'));

const Spinner = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
    <div className="spinner" style={{ width:36, height:36, borderTopColor:'var(--orange-500)' }} />
  </div>
);

function Guard({ children, admin = false }) {
  const { isAuthenticated, user } = useSelector(selectAuth);
  const loc = useLocation();
  if (!isAuthenticated) return <Navigate to="/auth" state={{ from: loc }} replace />;
  if (admin && !['admin','insurer','super_admin'].includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  useSocket();
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/" element={<Guard><AppLayout /></Guard>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<RiderDashboard />} />
        <Route path="policies" element={<Suspense fallback={<Spinner/>}><PolicyPage /></Suspense>} />
        <Route path="policies/buy" element={<Suspense fallback={<Spinner/>}><PolicyPage mode="buy" /></Suspense>} />
        <Route path="claims" element={<Suspense fallback={<Spinner/>}><ClaimsPage /></Suspense>} />
        <Route path="claims/:id" element={<Suspense fallback={<Spinner/>}><ClaimDetailPage /></Suspense>} />
        <Route path="payments" element={<Suspense fallback={<Spinner/>}><PaymentsPage /></Suspense>} />
        <Route path="community" element={<Suspense fallback={<Spinner/>}><CommunityPage /></Suspense>} />
        <Route path="profile" element={<Suspense fallback={<Spinner/>}><ProfilePage /></Suspense>} />
      </Route>
      <Route path="/admin" element={<Guard admin><AppLayout /></Guard>}>
        <Route index element={<AdminDashboard />} />
        <Route path="claims" element={<Suspense fallback={<Spinner/>}><AdminClaimsPage /></Suspense>} />
        <Route path="riders" element={<Suspense fallback={<Spinner/>}><AdminRidersPage /></Suspense>} />
        <Route path="fraud" element={<Suspense fallback={<Spinner/>}><AdminFraudPage /></Suspense>} />
        <Route path="map" element={<Suspense fallback={<Spinner/>}><AdminMapPage /></Suspense>} />
        <Route path="pool" element={<Suspense fallback={<Spinner/>}><AdminPoolPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ style: { background:'var(--bg-elevated)', color:'var(--text-primary)', border:'1px solid var(--border-strong)', borderRadius:'var(--r-md)', fontFamily:'var(--font-body)', fontSize:'0.9rem' }}} />
      </BrowserRouter>
    </Provider>
  );
}
