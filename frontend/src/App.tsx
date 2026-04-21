import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { Loader2 } from 'lucide-react';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    
    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-slate-950">
            <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
        </div>
    );
    
    if (!user) return <Navigate to="/auth" />;

    return <>{children}</>;
};

const AppContent: React.FC = () => {
    const { user } = useAuth();

    return (
        <Router>
            <Routes>
                <Route path="/auth" element={!user ? <AuthPage /> : <Navigate to="/" />} />
                <Route path="/admin" element={
                    <PrivateRoute>
                        <AdminDashboard />
                    </PrivateRoute>
                } />
                <Route path="/" element={
                    <PrivateRoute>
                        <Dashboard />
                    </PrivateRoute>
                } />
            </Routes>
        </Router>
    );
};


function App() {
  return (
    <AuthProvider>
        <AppContent />
    </AuthProvider>
  );
}

export default App;
