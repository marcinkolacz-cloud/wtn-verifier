import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Droplets, Moon, Sun } from 'lucide-react';
import { Proposals } from './views/Proposals';
import { ProposalDetail } from './views/ProposalDetail';
import { Monitor } from './views/Monitor';
import { Withdrawal } from './views/Withdrawal';
import { cx } from './components/ui';
import { REPO } from './lib/ic';

const useHash = () => {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const f = () => {
      setH(location.hash || '#/');
      window.scrollTo({ top: 0 });
    };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
};

const TABS = [
  ['#/', 'Proposals'],
  ['#/monitor', 'Monitor'],
  ['#/withdrawal', 'Withdrawal'],
] as const;

export default function App() {
  const hash = useHash();
  const go = (h: string) => (location.hash = h);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggle = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle('dark', d);
    try {
      localStorage.setItem('theme', d ? 'dark' : 'light');
    } catch {}
  };

  const m = hash.match(/^#\/proposal\/(\d+)/);
  const active = m ? '#/' : (TABS.find(([h]) => h === hash)?.[0] ?? '#/');
  const view = m ? (
    <ProposalDetail id={BigInt(m[1])} go={go} />
  ) : active === '#/monitor' ? (
    <Monitor />
  ) : active === '#/withdrawal' ? (
    <Withdrawal />
  ) : (
    <Proposals go={go} />
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-4">
          <a href="#/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-fg text-bg">
              <Droplets className="size-3.5" />
            </span>
            <span className="max-sm:hidden">WTN Verifier</span>
          </a>
          <nav className="flex gap-1 text-sm" aria-label="Main">
            {TABS.map(([h, label]) => (
              <a
                key={h}
                href={h}
                aria-current={active === h ? 'page' : undefined}
                className={cx(
                  'relative rounded-md px-2.5 py-1.5 transition-colors',
                  active === h ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {label}
                {active === h && (
                  <motion.span layoutId="tab" className="absolute inset-x-2 -bottom-[11px] h-px bg-fg" />
                )}
              </a>
            ))}
          </nav>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-fg/5 hover:text-fg"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={m ? 'p' + m[1] : active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {view}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-muted">
        All data is read on-chain via anonymous query calls. No backend.{' '}
        <a className="underline hover:text-fg" href={`https://github.com/${REPO}`} target="_blank" rel="noreferrer">
          Protocol source
        </a>
      </footer>
    </div>
  );
}
