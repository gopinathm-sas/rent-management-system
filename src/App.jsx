import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { UIProvider } from './contexts/UIContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import RoomDetails from './pages/RoomDetails';
import RentDetails from './pages/RentDetails';

// Placeholder Pages
import WaterBill from './pages/WaterBill';
import Expenses from './pages/Expenses';
import AdminMigration from './pages/AdminMigration';
import TenantUpload from './pages/TenantUpload';

import BiometricLock from './components/BiometricLock';
import Login from './pages/Login';

// Protected Route Wrapper
function ProtectedRoute({ children }) {
    const { currentUser, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (!currentUser) return <Navigate to="/login" />;
    return children;
}

// Component to handle global app locking
function GlobalLock() {
    const { isAppLocked, unlockApp, currentUser } = useAuth();

    // Only lock if user is logged in
    if (currentUser && isAppLocked) {
        return <BiometricLock />; // onUnlock handled internally via context
    }
    return null;
}

function App() {
    return (
        <AuthProvider>
            <UIProvider>
                <DataProvider>
                    <GlobalLock />
                    <Router>
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/upload/:token" element={<TenantUpload />} />
                            <Route path="/" element={
                                <ProtectedRoute>
                                    <Layout><Dashboard /></Layout>
                                </ProtectedRoute>
                            } />
                            <Route path="/rooms" element={
                                <ProtectedRoute>
                                    <Layout><RoomDetails /></Layout>
                                </ProtectedRoute>
                            } />
                            <Route path="/rent" element={
                                <ProtectedRoute>
                                    <Layout><RentDetails /></Layout>
                                </ProtectedRoute>
                            } />
                            <Route path="/water" element={
                                <ProtectedRoute>
                                    <Layout><WaterBill /></Layout>
                                </ProtectedRoute>
                            } />
                            <Route path="/expenses" element={
                                <ProtectedRoute>
                                    <Layout><Expenses /></Layout>
                                </ProtectedRoute>
                            } />
                            <Route path="/admin/migrate" element={
                                <ProtectedRoute>
                                    <Layout><AdminMigration /></Layout>
                                </ProtectedRoute>
                            } />
                        </Routes>
                    </Router>
                </DataProvider>
            </UIProvider>
        </AuthProvider>
    );
}

export default App;
