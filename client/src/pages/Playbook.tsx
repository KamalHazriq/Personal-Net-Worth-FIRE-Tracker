import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Button, Modal, Field, TextInput } from '../components/ui';

export default function Playbook() {
  const [rules, setRules] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null); // rule or {} for new

  const load = () => api('/playbook').then(setRules);
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="text-accent" />
          <div>
            <h1 className="text-2xl font-semibold">Playbook</h1>
            <p className="text-sm text-muted">Your own rules — the discipline you follow when emotions run high</p>
          </div>
        </div>
        <Button onClick={() => setEditing({ title: '', body: '' })}>
          <Plus size={16} /> Add rule
        </Button>
      </div>

      {rules.length === 0 && <Card className="p-8 text-center text-muted">No rules yet. Add your first playbook card.</Card>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((r) => (
          <Card key={r.id} className="p-5 group">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-accent">{r.title}</h3>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(r)} className="text-muted hover:text-accent"><Pencil size={14} /></button>
                <button
                  onClick={async () => {
                    if (confirm(`Delete "${r.title}"?`)) {
                      await api(`/playbook/${r.id}`, { method: 'DELETE' });
                      load();
                    }
                  }}
                  className="text-muted hover:text-loss"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 text-sm whitespace-pre-line leading-relaxed">{r.body}</div>
          </Card>
        ))}
      </div>

      {editing && (
        <RuleEditor
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RuleEditor({ rule, onClose, onSaved }: { rule: any; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(rule.title || '');
  const [body, setBody] = useState(rule.body || '');
  const isNew = !rule.id;

  const save = async () => {
    if (!title.trim()) return;
    if (isNew) await api('/playbook', { method: 'POST', body: JSON.stringify({ title, body }) });
    else await api(`/playbook/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ title, body }) });
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={isNew ? 'Add rule' : 'Edit rule'}>
      <Field label="Title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. When markets drop" autoFocus />
      </Field>
      <Field label="Rules / notes (one per line)">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent leading-relaxed"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}
