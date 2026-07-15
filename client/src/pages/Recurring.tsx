import { useState, useEffect, useCallback } from 'react';
import { Repeat, Plus, Trash2, Pencil } from 'lucide-react';
import { api, useDataRefresh } from '../lib/api';
import { rm } from '../lib/format';
import {
  Card,
  CardHeader,
  Stat,
  Badge,
  Button,
  Modal,
  Field,
  TextInput,
  SelectInput,
  PageSkeleton,
  cn,
} from '../components/ui';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RecurringTransaction {
  id: number;
  name: string;
  amount: number;
  category: 'expense' | 'income';
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  account_id: number | null;
  account_name: string | null;
}

interface Account {
  id: number;
  name: string;
  subtype: string;
}

interface FormState {
  name: string;
  amount: string;
  category: 'expense' | 'income';
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  account_id: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  amount: '',
  category: 'expense',
  frequency: 'monthly',
  account_id: '',
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Convert any frequency to a monthly equivalent amount. */
function toMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return amount; // monthly
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Recurring() {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [transactions, setTransactions] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  /* ---- data fetching ---- */

  const fetchData = useCallback(async () => {
    try {
      const [txRes, accRes] = await Promise.all([
        api('/recurring'),
        api('/accounts'),
      ]);
      setTransactions(txRes);
      setAccounts(accRes);
    } catch {
      toast('Failed to load recurring transactions');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useDataRefresh(fetchData);

  /* ---- computed summaries ---- */

  const totalMonthly = transactions.reduce((sum, t) => {
    const monthly = toMonthly(t.amount, t.frequency);
    return t.category === 'expense' ? sum + monthly : sum - monthly;
  }, 0);

  const totalYearly = totalMonthly * 12;

  const expenseCount = transactions.filter((t) => t.category === 'expense').length;

  /* ---- form helpers ---- */

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(tx: RecurringTransaction) {
    setEditingId(tx.id);
    setForm({
      name: tx.name,
      amount: String(tx.amount),
      category: tx.category,
      frequency: tx.frequency,
      account_id: tx.account_id ? String(tx.account_id) : '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /* ---- CRUD ---- */

  async function handleSubmit() {
    if (!form.name.trim() || !form.amount) return;

    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      category: form.category,
      frequency: form.frequency,
      account_id: form.account_id ? parseInt(form.account_id, 10) : null,
    };

    try {
      if (editingId) {
        await api(`/recurring/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast('Transaction updated');
      } else {
        await api('/recurring', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('Transaction added');
      }
      closeModal();
    } catch {
      toast('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      body: 'This removes it from your recurring list. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/recurring/${id}`, { method: 'DELETE' });
      toast('Transaction deleted');
    } catch {
      toast('Failed to delete');
    }
  }

  /* ---- loading state ---- */

  if (loading) return <PageSkeleton />;

  /* ---- render ---- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Repeat className="text-accent" />
        <div>
          <h1 className="text-2xl font-semibold">Recurring Transactions</h1>
          <p className="text-sm text-muted">
            Track your bills, subscriptions, and regular income.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <Stat
            label="Total Monthly Outflow"
            value={rm(Math.abs(totalMonthly))}
            sub={`across ${expenseCount} expense${expenseCount !== 1 ? 's' : ''}`}
          />
        </Card>
        <Card className="p-4">
          <Stat
            label="Total Yearly Cost"
            value={rm(Math.abs(totalYearly))}
            sub="projected annual total"
          />
        </Card>
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader
          title="All Recurring"
          subtitle={`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
          action={
            <Button onClick={openAdd}>
              <Plus size={16} />
              Add
            </Button>
          }
        />

        {transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted">
            No recurring transactions yet — add your bills and subscriptions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-border">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Amount (RM)</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-left px-3 py-2 font-medium">Frequency</th>
                  <th className="text-left px-3 py-2 font-medium">Linked Account</th>
                  <th className="text-right px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/40">
                    <td className="px-3 py-2 font-medium">{tx.name}</td>
                    <td className={cn('px-3 py-2 tabular-nums', tx.category === 'income' ? 'text-gain' : '')}>
                      {rm(tx.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={tx.category === 'income' ? 'gain' : 'loss'}>
                        {tx.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{FREQUENCY_LABELS[tx.frequency] ?? tx.frequency}</td>
                    <td className="px-3 py-2 text-muted">{tx.account_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" ariaLabel={`Edit ${tx.name}`} onClick={() => openEdit(tx)} className="icon-btn">
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" ariaLabel={`Delete ${tx.name}`} onClick={() => handleDelete(tx.id, tx.name)} className="icon-btn">
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit Recurring Transaction' : 'Add Recurring Transaction'}
      >
        <div className="space-y-4">
          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Netflix, Rent, Salary"
            />
          </Field>

          <Field label="Amount (RM)">
            <TextInput
              type="number"
              value={form.amount}
              onChange={(e) => setField('amount', e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Field label="Category">
            <SelectInput
              value={form.category}
              onChange={(e) => setField('category', e.target.value as FormState['category'])}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </SelectInput>
          </Field>

          <Field label="Frequency">
            <SelectInput
              value={form.frequency}
              onChange={(e) => setField('frequency', e.target.value as FormState['frequency'])}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </SelectInput>
          </Field>

          <Field label="Linked Account">
            <SelectInput
              value={form.account_id}
              onChange={(e) => setField('account_id', e.target.value)}
            >
              <option value="">None</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={String(acc.id)}>
                  {acc.name} ({acc.subtype})
                </option>
              ))}
            </SelectInput>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !form.name.trim() || !form.amount}>
              {submitting ? 'Saving…' : editingId ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
