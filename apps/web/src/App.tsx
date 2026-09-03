import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ClientPeriodProvider } from './context/ClientPeriodContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { JournalListPage } from './pages/JournalListPage';
import { JournalEntryFormPage } from './pages/JournalEntryFormPage';
import { JournalEntryDetailPage } from './pages/JournalEntryDetailPage';
import { AccountsPage } from './pages/AccountsPage';
import { LedgerPage } from './pages/LedgerPage';
import { GeneralLedgerPage } from './pages/GeneralLedgerPage';
import { TrialBalancePage } from './pages/TrialBalancePage';
import { StatementsPage } from './pages/StatementsPage';
import { FinancialStatementsPage } from './pages/FinancialStatementsPage';
import { DocumentsInboxPage } from './pages/DocumentsInboxPage';
import { DocumentReviewPage } from './pages/DocumentReviewPage';
import { AuditPage } from './pages/AuditPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ClientPeriodProvider>
              <Layout />
            </ClientPeriodProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/journal" replace />} />
        <Route path="journal" element={<JournalListPage />} />
        <Route path="journal/new" element={<JournalEntryFormPage />} />
        <Route path="journal/:id/edit" element={<JournalEntryFormPage />} />
        <Route path="journal/:id" element={<JournalEntryDetailPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="ledger/:accountId" element={<GeneralLedgerPage />} />
        <Route path="trial-balance" element={<TrialBalancePage />} />
        <Route path="statements" element={<StatementsPage />} />
        <Route path="financial-statements" element={<FinancialStatementsPage />} />
        <Route path="documents" element={<DocumentsInboxPage />} />
        <Route path="documents/:id" element={<DocumentReviewPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  );
}
