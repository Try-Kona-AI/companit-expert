import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import Translate from './pages/Translate'
import Invoices from './pages/Invoices'
import Customers from './pages/Customers'
import Winback from './pages/Winback'
import Jobs from './pages/Jobs'
import Settings from './pages/Settings'
import Guide from './pages/Guide'
import Pay from './pages/Pay'
import PaySuccess from './pages/PaySuccess'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public payment routes, no auth */}
      <Route path="/pay/:invoiceId" element={<Pay />} />
      <Route path="/pay/success" element={<PaySuccess />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="leads"     element={<Leads />} />
        <Route path="invoices"  element={<Invoices />} />
        <Route path="customers" element={<Customers />} />
        <Route path="winback"   element={<Winback />} />
        <Route path="jobs"      element={<Jobs />} />
        <Route path="translate" element={<Translate />} />
        <Route path="settings"  element={<Settings />} />
        <Route path="guide"     element={<Guide />} />
      </Route>
    </Routes>
  )
}
