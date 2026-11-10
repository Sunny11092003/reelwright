import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { useAuth } from './contexts/AuthContext';
import { AppLayout } from './layouts/AppLayout';
import { Accounts } from './pages/Accounts';
import { Activity } from './pages/Activity';
import { Analytics } from './pages/Analytics';
import { Brands } from './pages/Brands';
import { ContentEditor } from './pages/ContentEditor';
import { Create } from './pages/Create';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Login } from './pages/Login';
import { Publishing } from './pages/Publishing';
import { Scheduled } from './pages/Scheduled';
import { Settings } from './pages/Settings';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner label="Loading" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="create" element={<Create />} />
        <Route path="library" element={<Library />} />
        <Route path="content/:id" element={<ContentEditor />} />
        <Route path="publishing" element={<Publishing />} />
        <Route path="scheduled" element={<Scheduled />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="brands" element={<Brands />} />
        <Route path="activity" element={<Activity />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
