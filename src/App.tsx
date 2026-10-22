import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Droplets, FileText, Fuel, Moon, Sun, Tags, Wallet } from 'lucide-react';
import { Proposals } from './views/Proposals';
import { ProposalDetail } from './views/ProposalDetail';
import { Monitor } from './views/Monitor';
import { Withdrawal } from './views/Withdrawal';
import { Labels } from './views/Labels';
import { Cycles } from './views/Cycles';
import { startWatcher } from './lib/watch';
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
  ['#/', 'Proposals', FileText],
  ['#/monitor', 'Monitor', Activity],
  ['#/cycles', 'Cycles', Fuel],
  ['#/withdrawal', 'Withdrawal', Wallet],
  ['#/labels', 'Labels', Tags],
] as const;

export default function App() {
  const hash = useHash();
  useEffect(startWatcher, []);
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
  ) : active === '#/cycles' ? (
    <Cycles />
  ) : active === '#/withdrawal' ? (
    <Withdrawal />
  ) : active === '#/labels' ? (
    <Labels />
  ) : (
    <Proposals go={go} />
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
          <a href="#/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-fg text-bg">
              <Droplets className="size-3.5" />
            </span>
            <span className="flex flex-col leading-none">
              <span>WTN Watch</span>
              <span className="mt-0.5 text-[10px] font-normal tracking-normal text-muted">independent verifier</span>
            </span>
          </a>
          <nav className="flex gap-0.5 text-sm max-sm:hidden" aria-label="Main">
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

      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
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

      <footer className="mx-auto max-w-6xl px-4 pb-24 text-xs text-muted sm:px-6 sm:pb-10">
        WTN Watch is an independent community tool, not affiliated with WaterNeuron. All data is read on-chain; no backend.{' '}
        <a className="underline hover:text-fg" href={`https://github.com/${REPO}`} target="_blank" rel="noreferrer">
          Protocol source
        </a>
      </footer>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        {TABS.map(([h, label, Icon]) => (
          <a
            key={h}
            href={h}
            aria-current={active === h ? 'page' : undefined}
            className={cx(
              'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              active === h ? 'text-fg' : 'text-muted',
            )}
          >
            <Icon className="size-5" />
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
