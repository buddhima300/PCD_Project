import React, { createContext, useContext, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

const DialogDepth = createContext(0);
const activeDialogs: {id:string;depth:number;element:HTMLDivElement}[] = [];
let previousBodyOverflow = '';
function updateDialogLayers() {
  activeDialogs.sort((a,b)=>a.depth-b.depth);
  activeDialogs.forEach((dialog,index)=>{dialog.element.style.zIndex=String(50+index*2);});
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  placement?: 'center' | 'right';
  backdropBlur?: boolean;
  portal?: boolean;
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', placement = 'center', backdropBlur = false, portal = true }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const depth = useContext(DialogDepth);
  const titleId = useId();
  const descriptionId = useId();
  const reducedMotion = useReducedMotion();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !layerRef.current) return;
    const prev = document.activeElement as HTMLElement | null;
    if(!activeDialogs.length){previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    activeDialogs.push({id:titleId,depth,element:layerRef.current});
    updateDialogLayers();
    const isTop = () => activeDialogs[activeDialogs.length-1]?.id === titleId;
    const t = setTimeout(() => {
      if(!isTop())return;
      const el = ref.current?.querySelector<HTMLElement>('a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled):not([data-close])');
      (el ?? ref.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if(!isTop())return;
      if (e.key === 'Escape') {e.preventDefault();e.stopPropagation();closeRef.current();}
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)'))
          .filter(el=>el.tabIndex>=0&&!el.closest('[hidden],[inert]')&&!(el instanceof HTMLInputElement&&el.type==='hidden'))
          .sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
        if (!f.length) {e.preventDefault();ref.current.focus();return;}
        const first = f[0];
        const last = f[f.length - 1];
        if (!ref.current.contains(document.activeElement)) {
          e.preventDefault();(e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      const restoreFocus=isTop();
      const index=activeDialogs.findIndex(dialog=>dialog.id===titleId);
      if(index!==-1)activeDialogs.splice(index,1);
      updateDialogLayers();
      if(!activeDialogs.length)document.body.style.overflow=previousBodyOverflow;
      if(restoreFocus&&prev?.isConnected)prev.focus();
    };
  }, [open,titleId,depth]);

  const content = (
    <DialogDepth.Provider value={depth+1}><AnimatePresence>
      {open &&
      <div ref={layerRef} data-dialog-layer className={cn('fixed inset-0 z-50 flex', placement === 'right' ? 'items-stretch justify-end' : 'items-end justify-center p-0 sm:items-center sm:p-4')}>
          <motion.div
          className={cn('absolute inset-0 bg-ink/40',backdropBlur&&'backdrop-blur-md')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
          onClick={onClose} />
        
          <motion.div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
          className={cn(
            'app-panel relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-white/90 bg-surface shadow-pop sm:rounded-2xl',
            size === 'sm' ? 'sm:max-w-md' : size === 'md' ? 'sm:max-w-lg' : 'sm:max-w-3xl',
            placement === 'right' && 'equipment-detail-panel !max-h-screen !rounded-none'
          )}>
          
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 id={titleId} className="text-base font-semibold text-ink">
                  {title}
                </h2>
                {description && <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">{description}</p>}
              </div>
              <button data-close onClick={onClose} className="rounded-lg p-1 text-ink-subtle hover:bg-mist hover:text-ink" aria-label="Close dialog">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      }
    </AnimatePresence></DialogDepth.Provider>);

  return portal ? createPortal(content,document.body) : content;
}
