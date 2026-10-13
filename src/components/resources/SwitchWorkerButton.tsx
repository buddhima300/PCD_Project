import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOutIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { useSessionStore } from '../../hooks/useSessionStore';

export function SwitchWorkerButton({ disabled = false }: { disabled?: boolean }) {
  const qc = useQueryClient(); const navigate = useNavigate();
  const switchWorker = () => {
    useSessionStore.getState().signOut();
    void qc.cancelQueries(); qc.clear();
    localStorage.removeItem('portcity-login-email');
    navigate('/login?switchWorker=1', { replace: true });
  };
  return <Button variant="secondary" icon={<LogOutIcon className="h-4 w-4" />} disabled={disabled} onClick={switchWorker}>Switch worker</Button>;
}
