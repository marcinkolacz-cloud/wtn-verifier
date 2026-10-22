import { useRef, useState, type FormEvent } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { DEFAULT_LABELS, ENTITIES, setUserLabels, userLabels, type Entity, type Label } from '../lib/data';
import { Badge, Button, Card, CardHeader, Empty, Mono } from '../components/ui';

const TAGGABLE: Entity[] = ['DFINITY', 'Developers', 'Whales'];

export function Labels() {
  const [user, setUser] = useState(userLabels);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [entity, setEntity] = useState<Entity>('Developers');
  const [msg, setMsg] = useState<string>();
  const file = useRef<HTMLInputElement>(null);

  const commit = (next: Record<string, Label>) => {
    setUser(next);
    setUserLabels(next);
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (!/^[a-z0-9-]{5,}$/i.test(k)) return setMsg('Key must be a principal or a neuron-id prefix (16 hex chars).');
    commit({ ...user, [k.length === 64 ? k.slice(0, 16) : k]: { name: name.trim() || entity, entity } });
    setKey('');
    setName('');
    setMsg(undefined);
  };

  const remove = (k: string) => {
    const next = { ...user };
    delete next[k];
    commit(next);
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(user, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'wtn-labels.json' });
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Record<string, Label>;
      const clean = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v && typeof v.name === 'string' && ENTITIES.includes(v.entity)),
      );
      commit({ ...user, ...clean });
      setMsg(`Imported ${Object.keys(clean).length} labels.`);
    } catch {
      setMsg('Invalid JSON file.');
    }
  };

  const rows = [
    ...Object.entries(DEFAULT_LABELS).filter(([k]) => !(k in user)).map(([k, v]) => ({ k, v, def: true })),
    ...Object.entries(user).map(([k, v]) => ({ k, v, def: false })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Voter labels</h1>
          <p className="text-sm text-muted">Group neurons by controller principal or neuron-id prefix. Stored in this browser.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => file.current?.click()}>
            <Upload className="size-3.5" /> Import
          </Button>
          <Button onClick={exportJson} disabled={!Object.keys(user).length}>
            <Download className="size-3.5" /> Export
          </Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
      </div>

      <Card>
        <CardHeader title="Add label" sub="Unlabelled voters with ≥1% of voting power count as Whales automatically" />
        <form onSubmit={add} className="flex flex-wrap gap-2 px-5 py-4">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="principal or neuron id"
            aria-label="Principal or neuron id"
            className="h-8 min-w-60 flex-[2] rounded-lg border border-line bg-panel px-3 font-mono text-xs outline-none focus:border-accent"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            aria-label="Name"
            className="h-8 min-w-32 flex-1 rounded-lg border border-line bg-panel px-3 text-xs outline-none focus:border-accent"
          />
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as Entity)}
            aria-label="Group"
            className="h-8 rounded-lg border border-line bg-panel px-2 text-xs"
          >
            {TAGGABLE.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
          <Button type="submit" variant="primary" disabled={!key.trim()}>
            <Plus className="size-3.5" /> Add
          </Button>
        </form>
        {msg && <div className="px-5 pb-4 text-xs text-muted">{msg}</div>}
      </Card>

      <Card className="divide-y divide-line">
        {rows.length ? (
          rows.map(({ k, v, def }) => (
            <div key={k} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="w-28 shrink-0 truncate font-medium">{v.name}</span>
              <Mono className="min-w-0 flex-1 truncate text-muted">{k}</Mono>
              <Badge tone={v.entity === 'DFINITY' ? 'accent' : v.entity === 'Developers' ? 'yes' : 'warn'}>{v.entity}</Badge>
              {def ? (
                <Badge>default</Badge>
              ) : (
                <button
                  onClick={() => remove(k)}
                  aria-label={`Remove ${v.name}`}
                  className="grid size-7 place-items-center rounded-md text-muted hover:bg-fg/5 hover:text-no"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty>No labels</Empty>
        )}
      </Card>
    </div>
  );
}
