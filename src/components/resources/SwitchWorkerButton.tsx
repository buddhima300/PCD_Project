import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOutIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { useSessionStore } from '../../hooks/useSessionStore';
import { toast } from 'sonner';

export function SwitchWorkerButton({ disabled = false }: { disabled?: boolean }) {
  const qc = useQueryClient(); const navigate = useNavigate();
  const switchWorker = async () => {
    try {
      await useSessionStore.getState().signOut();
      await qc.cancelQueries(); qc.clear();
      localStorage.removeItem('portcity-login-email');
      navigate('/login?switchWorker=1', { replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not sign out. Try again.'); }
  };
  return <Button variant="secondary" icon={<LogOutIcon className="h-4 w-4" />} disabled={disabled} onClick={switchWorker}>Switch worker</Button>;
}
