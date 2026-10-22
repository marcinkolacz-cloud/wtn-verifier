import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import type { ProposalData } from '../declarations/sns_governance';
import { getProposal, status } from '../lib/data';
import { opt } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { ExplainBody, useExplain, verdictOf } from './Explain';
import { Flags } from './Flags';
import { Badge, Button, Mono } from './ui';
import { statusTone } from '../views/Proposals';

export function ProposalModal({ p: listP, onClose, onOpen }: { p: ProposalData; onClose: () => void; onOpen: () => void }) {
  const id = opt(listP.id)!.id;
  const { data: full } = useAsync(() => getProposal(id), [id]);
  const p = full ?? listP;
  const ex = useExplain(id);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeFn = useRef(onClose);
  closeFn.current = onClose;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFn.current();
    addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      removeEventListener('keydown', onKey);
    };
  }, []);

  const s = status(p);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Mono className="text-muted">#{String(id)}</Mono>
              <Badge tone={statusTone(s)}>{s}</Badge>
            </div>
            <h2 id="pm-title" className="mt-1 text-base font-semibold leading-snug tracking-tight">
              {opt(p.proposal)?.title || 'Untitled'}
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-fg/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted uppercase">At a glance</h3>
            <Flags p={p} verdict={verdictOf(ex)} />
          </section>
          <section>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted uppercase">In plain words</h3>
            <ExplainBody st={ex} />
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className="text-[11px] text-muted">Not a voting recommendation. Always do your own research.</span>
          <Button variant="primary" onClick={onOpen}>
            Full details <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
