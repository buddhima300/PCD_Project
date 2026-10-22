import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LaptopModelEditor } from '../../components/resources/LaptopModelEditor';
import { api } from '../../services/api';
import type { Laptop } from '../../types/domain';
vi.mock('../../services/api',()=>({api:{listLaptopModels:vi.fn(),addLaptopModel:vi.fn(),updateLaptopModel:vi.fn()},errorMessage:(e:Error)=>e.message}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const laptop={assetId:'LAP-1',model:'Latitude 7450'} as Laptop;
function mount(){
  vi.mocked(api.listLaptopModels).mockResolvedValue(['Latitude 7450','ThinkPad T14']);
  vi.mocked(api.updateLaptopModel).mockResolvedValue({...laptop,model:'ThinkPad T14'});
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const rowClick=vi.fn();
  render(<QueryClientProvider client={client}><div onClick={rowClick}><LaptopModelEditor laptop={laptop}/></div></QueryClientProvider>);
  return rowClick;
}
it('edits the model from the dropdown without opening the workstation row',async()=>{
  const rowClick=mount();
  await screen.findByRole('option',{name:'ThinkPad T14'});
  const select=screen.getByRole('combobox',{name:'Laptop model for LAP-1'});
  fireEvent.click(select);
  fireEvent.change(select,{target:{value:'ThinkPad T14'}});
  await waitFor(()=>expect(api.updateLaptopModel).toHaveBeenCalledWith('LAP-1',{model:'ThinkPad T14',expectedModel:'Latitude 7450'}));
  expect(rowClick).not.toHaveBeenCalled();
});
it('adds a reusable model and applies the saved name',async()=>{
  mount();vi.mocked(api.addLaptopModel).mockResolvedValue('New laptop model');
  await screen.findByRole('option',{name:'ThinkPad T14'});
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'__ADD_MODEL__'}});
  fireEvent.change(screen.getByLabelText('Laptop model name'),{target:{value:'  New laptop model  '}});
  fireEvent.click(screen.getByRole('button',{name:'Add and apply model'}));
  await waitFor(()=>expect(api.updateLaptopModel).toHaveBeenCalledWith('LAP-1',{model:'New laptop model',expectedModel:'Latitude 7450'}));
  expect(api.addLaptopModel).toHaveBeenCalledWith('New laptop model');
});
it('keeps the current model visible when saving fails',async()=>{
  mount();vi.mocked(api.updateLaptopModel).mockRejectedValue(new Error('Model changed. Refresh.'));
  await screen.findByRole('option',{name:'ThinkPad T14'});
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'ThinkPad T14'}});
  expect(await screen.findByRole('alert')).toHaveTextContent('Model changed. Refresh.');
  expect(screen.getByRole('combobox')).toHaveValue('Latitude 7450');
});
