import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EquipmentWorkspace } from '../../pages/resources/EquipmentWorkspace';
import { api } from '../../services/api';
import type { Laptop } from '../../types/domain';

vi.mock('../../services/api', () => ({api: {listWorkstations: vi.fn(), getWorkstation: vi.fn()}}));
vi.mock('../../hooks/useReferenceData', () => ({useReferenceData: () => ({categories: [], platforms: []})}));
afterEach(() => {cleanup(); vi.clearAllMocks();});
function mount() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter><EquipmentWorkspace /></MemoryRouter></QueryClientProvider>);
}
const seat = {workstationId: 'WS-KANE13-DP01', poolId: 'POOL-KANE13-DP', platformCode: 'KANE-13', categoryCode: 'KANE', dept: 'DP' as const, laptop: null};

it('shows four columns and opens the selected workstation with freshly fetched device and user data', async () => {
  vi.mocked(api.listWorkstations).mockResolvedValue({items: [seat], total: 1, page: 1, pageSize: 25});
  vi.mocked(api.getWorkstation).mockResolvedValue({workstation: {...seat, laptop: {assetId: 'REAL-42', model: 'Latitude 7450', serial: 'DB-SERIAL', currentUserName: 'Current database holder', currentShift: 'NIGHT'} as Laptop}, history: []});
  mount();
  const table = await screen.findByRole('table', {name: 'Workstation inventory'});
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Pool', 'Workstation', 'Laptop model', 'Current user']);
  expect(screen.queryByRole('link', {name: 'Workstation Pools'})).not.toBeInTheDocument();
  expect(screen.queryByRole('link', {name: /^Incidents$/})).not.toBeInTheDocument();
  expect(within(table).getByText('No laptop registered')).toBeInTheDocument();
  fireEvent.keyDown(within(table).getAllByRole('row')[1], {key: 'Enter'});
  const panel = await screen.findByRole('dialog', {name: seat.workstationId});
  expect(await within(panel).findByText('Current database holder')).toBeInTheDocument();
  expect(within(panel).getByText('DB-SERIAL')).toBeInTheDocument();
  expect(api.getWorkstation).toHaveBeenCalledWith(seat.workstationId);
  expect(within(panel).getByRole('link', {name: 'Open full record'})).toHaveAttribute('href', '/laptops/REAL-42');
});

it('opens an empty seat without inventing a laptop or a full record link', async () => {
  vi.mocked(api.listWorkstations).mockResolvedValue({items: [seat], total: 1, page: 1, pageSize: 25});
  vi.mocked(api.getWorkstation).mockResolvedValue({workstation: seat, history: []});
  mount();
  fireEvent.click(await screen.findByText(seat.workstationId));
  const panel = await screen.findByRole('dialog', {name: seat.workstationId});
  expect(await within(panel).findByText('No laptop registered')).toBeInTheDocument();
  expect(within(panel).queryByRole('link', {name: 'Open full record'})).not.toBeInTheDocument();
  expect(within(panel).getByText('No activity recorded')).toBeInTheDocument();
});
