import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listClients } from '../api/me';
import { listPeriods, Period } from '../api/periods';
import { queryKeys } from '../api/queryKeys';

interface ClientPeriodContextValue {
  clientId: string | null;
  periodId: string | null;
  period: Period | null;
  clients: { id: string; name: string }[];
  periods: Period[];
  setClientId: (id: string) => void;
  setPeriodId: (id: string) => void;
  isPeriodClosed: boolean;
}

const ClientPeriodContext = createContext<ClientPeriodContextValue | undefined>(undefined);

// Held in the URL as search params (?clientId=&periodId=) so a screen can be linked and the
// browser back button behaves — almost every question in this application is "for which
// client, in which period".
export function ClientPeriodProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const clientId = searchParams.get('clientId');
  const periodId = searchParams.get('periodId');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: listClients,
  });

  const { data: periods = [] } = useQuery({
    queryKey: queryKeys.periods(clientId ?? ''),
    queryFn: () => listPeriods(clientId!),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!clientId && clients.length > 0) {
      setSearchParams((prev) => {
        prev.set('clientId', clients[0].id);
        return prev;
      });
    }
  }, [clientId, clients, setSearchParams]);

  useEffect(() => {
    if (clientId && !periodId && periods.length > 0) {
      const open = periods.find((p) => p.status === 'OPEN') ?? periods[periods.length - 1];
      setSearchParams((prev) => {
        prev.set('periodId', open.id);
        return prev;
      });
    }
  }, [clientId, periodId, periods, setSearchParams]);

  const setClientId = (id: string) => {
    setSearchParams((prev) => {
      prev.set('clientId', id);
      prev.delete('periodId');
      return prev;
    });
    queryClient.invalidateQueries();
  };

  const setPeriodId = (id: string) => {
    setSearchParams((prev) => {
      prev.set('periodId', id);
      return prev;
    });
    queryClient.invalidateQueries();
  };

  const period = useMemo(() => periods.find((p) => p.id === periodId) ?? null, [periods, periodId]);

  return (
    <ClientPeriodContext.Provider
      value={{
        clientId,
        periodId,
        period,
        clients,
        periods,
        setClientId,
        setPeriodId,
        isPeriodClosed: period?.status === 'CLOSED',
      }}
    >
      {children}
    </ClientPeriodContext.Provider>
  );
}

export function useClientPeriod(): ClientPeriodContextValue {
  const ctx = useContext(ClientPeriodContext);
  if (!ctx) throw new Error('useClientPeriod must be used within a ClientPeriodProvider');
  return ctx;
}
