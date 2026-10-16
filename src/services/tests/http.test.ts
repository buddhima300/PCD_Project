import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { request, login, logout, restoreSession, clearTransportSession, SESSION_EXPIRED } from '../http';
import { useSessionStore } from '../../hooks/useSessionStore';
import { api } from '../api';

const user = { id:'server-user-id',name:'Server User',email:'user@example.test',role:'SUPERVISOR' as const,title:'Supervisor' };
const session = { user,permissions:['audit.read'],csrfToken:'server-csrf' };
const response = (data:unknown,status=200) => new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const fetchMock = vi.fn<typeof fetch>();
beforeEach(()=>{clearTransportSession();useSessionStore.getState().clear();localStorage.clear();vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
afterEach(()=>{clearTransportSession();vi.unstubAllGlobals();});

it('uses cookie credentials and only sends entered email/password when logging in',async()=>{
  fetchMock.mockResolvedValue(response(session));
  await login(user.email,'entered-password');
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/login',expect.objectContaining({method:'POST',credentials:'include',body:JSON.stringify({email:user.email,password:'entered-password'})}));
  expect(localStorage.getItem('relay-wfm-session')).toBeNull();
});
it('restores identity and CSRF from the server and sends CSRF on writes',async()=>{
  fetchMock.mockResolvedValueOnce(response(session)).mockResolvedValueOnce(response({id:'new-worker'}));
  await restoreSession();await request('/workers',{method:'POST',body:{name:'New worker'}});
  expect(fetchMock.mock.calls[1][1]).toMatchObject({credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':'server-csrf'}});
});
it('revokes server session before local sign-out and retains identity on network failure',async()=>{
  useSessionStore.getState().signIn(user,session.permissions);
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  await expect(useSessionStore.getState().signOut()).rejects.toMatchObject({code:'NETWORK_FAILURE'});
  expect(useSessionStore.getState().user?.id).toBe(user.id);
  fetchMock.mockResolvedValueOnce(response(null,204));
  await useSessionStore.getState().signOut();expect(useSessionStore.getState().user).toBeNull();
});
it('expires the UI session on server 401 without treating a wrong password as session expiry',async()=>{
  const expired=vi.fn();window.addEventListener(SESSION_EXPIRED,expired);
  try{
    fetchMock.mockResolvedValueOnce(response({error:{code:'UNAUTHENTICATED',message:'Expired'}},401));
    await expect(request('/workers')).rejects.toMatchObject({status:401});expect(expired).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(response({error:{code:'INVALID_CREDENTIALS',message:'Invalid'}},401));
    await expect(login(user.email,'wrong')).rejects.toMatchObject({status:401});expect(expired).toHaveBeenCalledTimes(1);
  }finally{window.removeEventListener(SESSION_EXPIRED,expired);}
});
it('rejects late responses after an account switch',async()=>{
  let complete:(value:Response)=>void=()=>undefined;
  fetchMock.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const pending=request('/workers');clearTransportSession();complete(response({items:[{name:'Old account data'}]}));
  await expect(pending).rejects.toMatchObject({code:'SESSION_CHANGED'});
});
it('reports uncertain writes without retrying or inventing success',async()=>{
  fetchMock.mockRejectedValue(new TypeError('lost response'));
  await expect(request('/workers',{method:'POST',body:{}})).rejects.toMatchObject({code:'NETWORK_FAILURE',message:expect.stringContaining('whether the change was saved')});
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('handles empty logout responses and rejects unexpected HTML',async()=>{
  fetchMock.mockResolvedValueOnce(response(null,204));await expect(logout()).resolves.toBeUndefined();
  fetchMock.mockResolvedValueOnce(new Response('<html>Vite fallback</html>',{status:200}));
  await expect(request('/workers')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('restores server grants instead of trusting an old browser identity',async()=>{
  localStorage.setItem('relay-wfm-session',JSON.stringify({state:{user:{role:'SUPERVISOR',id:'forged'}}}));
  fetchMock.mockResolvedValue(response({...session,user:{...user,id:'real-employee',role:'EMPLOYEE'},permissions:[]}));
  await useSessionStore.getState().initialize();
  expect(useSessionStore.getState().user?.id).toBe('real-employee');
  expect(useSessionStore.getState().permissions).toEqual([]);
});
it('original screen facade calls the authenticated operations endpoint',async()=>{
  fetchMock.mockResolvedValue(response({rows:[],days:[],totals:{}}));
  await api.getRoster({month:'2026-10'});
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/operations/workflows/getRoster',expect.objectContaining({method:'POST',credentials:'include',body:JSON.stringify({args:[{month:'2026-10'}]})}));
});
