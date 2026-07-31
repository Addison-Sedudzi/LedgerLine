import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState } from '../components/ErrorState';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: 320,
          padding: 'var(--space-6)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
        }}
      >
        <h1 style={{ marginBottom: 'var(--space-1)' }}>LedgerLine</h1>
        <p style={{ color: 'var(--ink-muted)', marginTop: 0, marginBottom: 'var(--space-5)' }}>
          Sign in to continue
        </p>

        {error && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <ErrorState message={error} />
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 4 }}>Email</div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 4 }}>Password</div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '10px',
            border: 'none',
            borderRadius: 'var(--radius)',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
