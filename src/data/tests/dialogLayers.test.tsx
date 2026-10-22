import { useState } from 'react';
import { afterEach,expect,it } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { Dialog } from '../../components/ui/Dialog';

afterEach(()=>{cleanup();document.body.style.overflow='';});

it('renders ordinary dialogs outside transformed and clipped page containers by default',()=>{
  const view=render(<div style={{transform:'translateZ(0)',overflow:'hidden',isolation:'isolate'}}><Dialog open title="Add platform category" onClose={()=>undefined} description="Category details"><input aria-label="Category code"/></Dialog></div>);
  const dialog=screen.getByRole('dialog',{name:'Add platform category'});
  expect(view.container.contains(dialog)).toBe(false);
  expect(dialog.closest('[data-dialog-layer]')?.parentElement).toBe(document.body);
  expect(dialog).toHaveAccessibleDescription('Category details');
});

function NestedDialogs(){
  const [parent,setParent]=useState(false),[child,setChild]=useState(false);
  return <><button onClick={()=>setParent(true)}>Open details</button><Dialog open={parent} onClose={()=>setParent(false)} title="Staff details"><button onClick={()=>setChild(true)}>Open correction</button><Dialog open={child} onClose={()=>setChild(false)} title="Correction"><input aria-label="Reason"/><button>Save correction</button></Dialog></Dialog></>;
}
it('keeps nested dialogs above their parent, traps focus, and closes only the top dialog on Escape',async()=>{
  document.body.style.overflow='clip';
  render(<NestedDialogs/>);
  const trigger=screen.getByRole('button',{name:'Open details'});trigger.focus();fireEvent.click(trigger);
  const correction=await screen.findByRole('button',{name:'Open correction'});
  correction.focus();fireEvent.click(correction);
  const child=screen.getByRole('dialog',{name:'Correction'}),parent=screen.getByRole('dialog',{name:'Staff details'});
  expect(Number(child.closest<HTMLElement>('[data-dialog-layer]')?.style.zIndex)).toBeGreaterThan(Number(parent.closest<HTMLElement>('[data-dialog-layer]')?.style.zIndex));
  await waitFor(()=>expect(screen.getByLabelText('Reason')).toHaveFocus());
  screen.getByRole('button',{name:'Save correction'}).focus();fireEvent.keyDown(document,{key:'Tab'});
  expect(child.querySelector('[data-close]')).toHaveFocus();
  fireEvent.keyDown(document,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Correction'})).not.toBeInTheDocument());
  expect(screen.getByRole('dialog',{name:'Staff details'})).toBeVisible();expect(correction).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.overflow).toBe('clip');expect(trigger).toHaveFocus();
});
it('restores page scrolling when a modal is unmounted during navigation',()=>{
  document.body.style.overflow='auto';
  const view=render(<Dialog open title="Add platform" onClose={()=>undefined}><input aria-label="Platform code"/></Dialog>);
  expect(document.body.style.overflow).toBe('hidden');view.unmount();
  expect(document.body.style.overflow).toBe('auto');
});
