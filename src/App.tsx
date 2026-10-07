import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from 'sonner';
import { LoginPage } from '@/pages/LoginPage';
import { Layout } from '@/components/layout/Layout';
import { POSPage } from '@/pages/POSPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { DebtsPage } from '@/pages/DebtsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<POSPage />} />
        <Route path="barang" element={<ProductsPage />} />
        <Route path="stok" element={<InventoryPage />} />
        <Route path="hutang" element={<DebtsPage />} />
        <Route path="laporan" element={<ReportsPage />} />
        <Route path="riwayat" element={<HistoryPage />} />
        <Route path="setelan" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" theme="system" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;