import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlatformSetupActions } from '../../components/platform/PlatformSetup';
import { useSessionStore } from '../../hooks/useSessionStore';
import { db } from '../../services/mock/db';
import { mockConfig, setAuthContext } from '../../services/mock/core';
vi.mock('../../services/api', () => import('../../services/mock/testFacade'));

const original = structuredClone({ categories: db.categories, platforms: db.platforms, audit: db.audit });
beforeEach(() => { mockConfig.latencyMs = 0; setAuthContext({userId:'SUP-TEST',name:'Supervisor',role:'SUPERVISOR'}); useSessionStore.getState().signIn({ id: 'SUP-TEST', name: 'Supervisor', role: 'SUPERVISOR', title: 'Supervisor', email: 'supervisor@example.com' }); });
afterEach(() => { cleanup(); for (const key of Object.keys(original) as (keyof typeof original)[]) { const array = db[key] as unknown[]; array.splice(0, array.length, ...structuredClone(original[key])); } useSessionStore.getState().clear(); setAuthContext(null); mockConfig.latencyMs = 320; });
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter><PlatformSetupActions /></MemoryRouter></QueryClientProvider>); }

it('creates a setup platform, saves targets, skips staffing and explicitly activates', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Add platform' }));
  await screen.findByRole('option', { name: 'KANE · KANE' });
  fireEvent.change(screen.getByLabelText('Platform category'), { target: { value: 'KANE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Platform code'), { target: { value: 'KANE-999' } });
  fireEvent.change(screen.getByLabelText('Platform name'), { target: { value: 'New operations' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create platform in setup' }));
  await screen.findByLabelText('Shared devices', { selector: '#seats-DP' });
  expect(db.platforms.find(p => p.code === 'KANE-999')?.lifecycle).toBe('SETUP');
  fireEvent.change(screen.getByLabelText('Shared devices', { selector: '#seats-DP' }), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Morning staffing target', { selector: '#target-DP-MORNING' }), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save capacity & continue' }));
  await screen.findByText('Staffing is managed in Workforce');
  fireEvent.click(screen.getByRole('button', { name: 'Review platform' }));
  await screen.findByRole('button', { name: 'Activate platform' });
  fireEvent.click(screen.getByRole('button', { name: 'Activate platform' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(db.platforms.find(p => p.code === 'KANE-999')).toMatchObject({ status: 'ACTIVE', lifecycle: 'OPERATIONAL', departments: { DP: 2 }, staffingTargets: { DP: { MORNING: 1, NIGHT: 0 } } });
});

it('confirms discarding unsaved details without saving a category', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
  fireEvent.change(screen.getByLabelText('Category code'), { target: { value: 'UITEST' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  expect(screen.getByText('Discard these unsaved category details?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Category code')).toHaveValue('UITEST');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(db.categories.some(c => c.code === 'UITEST')).toBe(false);
});

it('hides creation actions from employees', () => {
  useSessionStore.getState().signIn({ id: 'EMP-TEST', name: 'Employee', role: 'EMPLOYEE', title: 'Agent', email: 'employee@example.com' }); mount();
  expect(screen.queryByRole('button', { name: 'Add platform' })).not.toBeInTheDocument();
});
