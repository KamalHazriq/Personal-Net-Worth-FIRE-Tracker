import type Database from 'better-sqlite3';
import {
  dashboardSummary,
  latestAllocation,
  holdingsLatest,
  getSettings,
  fireSeed,
  driftAlerts,
} from './queries.js';

export const SYSTEM_PROMPT = `You are a personal finance organiser & analysis assistant for a Malaysian FIRE investor. Base currency is MYR (RM). This is ANALYSIS and ORGANISATION, explicitly NOT licensed financial advice.

The user follows a STRICT Shariah-compliance rule with NO exceptions. You must:
- NEVER give a Shariah-compliance verdict from memory. If asked whether something is halal/compliant, state it must be verified against a dedicated screener (e.g. Zoya, Musaffa, Islamicly) and, if web search is available, look it up and cite the source — otherwise say it is unverified.
- NEVER present prices, P/L, or analyst targets from your training data as current. Use web search for anything time-sensitive, or clearly label it as possibly stale.
- Frame everything as analysis and trade-offs, not directives. End any buy/sell discussion by reminding the user to verify the current price + Shariah status themselves and that you are not a licensed advisor.
- Do all reasoning over the structured numbers provided in the user's data context (they are computed by the app — trust them; do not recompute or invent figures).
- For any leverage, debt, tax, EPF, or large/irreversible reallocation question, add a clear "this is a professional-advice question" flag and recommend consulting a licensed financial planner or Shariah advisor.
- Prefer clear structure: numbered action steps and price-level decision trees — but only after the data is verified.
- Never auto-execute anything; you read and advise, the user acts.

Keep answers concise and grounded in the user's actual numbers.`;

/** Build a compact JSON snapshot of the user's current financial picture. */
export function buildContext(db: Database.Database) {
  const dash: any = dashboardSummary(db);
  const alloc: any = latestAllocation(db);
  const holdings: any = holdingsLatest(db);
  const settings: any = getSettings(db);
  const fire: any = fireSeed(db);

  const positions = (holdings.positions || []).map((p: any) => ({
    symbol: p.symbol,
    qty: p.quantity,
    avgCost: p.avg_cost,
    price: p.current_price,
    plPct: p.pct_unrealized_pl,
    pctPortfolio: p.pct_portfolio,
    tag: p.asset_class,
    sector: p.sub_tag || undefined,
  }));

  return {
    asOf: dash.latestDate,
    currency: 'MYR',
    netWorth: dash.netWorth,
    netWorthExcludingEPF: dash.netWorthExEpf,
    epfLocked: dash.epf,
    liquidCash: dash.bank,
    investments: dash.investment,
    avgMonthlyGrowth: dash.avgMonthlyGrowth,
    avgMonthlyInvested: dash.avgMonthlyInvested,
    allocationByCategory: (alloc.items || []).map((i: any) => ({ label: i.label, value: i.value, pct: i.pct })),
    moomoo: holdings.summary
      ? {
          asOf: holdings.snapshot?.import_date,
          totalValueMYR: holdings.summary.totalMV_myr,
          unrealizedPLpct: holdings.summary.plPct,
          etfPct: holdings.summary.etfPct,
          individualPct: holdings.summary.individualPct,
          usdMyrRate: holdings.rate,
          positions,
        }
      : null,
    fireSettings: {
      currentAge: settings.current_age,
      targetRetireAge: settings.target_retire_age,
      epfUnlockAge: settings.epf_unlock_age,
      targetMonthlyIncome: settings.fire_target_monthly_income,
      swr: settings.swr,
      fireNumber: settings.swr > 0 ? (settings.fire_target_monthly_income * 12) / settings.swr : null,
      monthlyContributions: fire.accounts
        .filter((a: any) => a.monthly_amount > 0)
        .map((a: any) => ({ account: a.name, monthly: a.monthly_amount, assumedReturn: a.annual_return_rate })),
    },
    playbook: (db.prepare('SELECT title, body FROM playbook_rules ORDER BY sort_order').all() as any[]),
    concentrationFlags: driftAlerts(db).alerts,
    goals: (db.prepare('SELECT label, target_json FROM goals').all() as any[]).map((g: any) => ({
      label: g.label,
      target: safeJson(g.target_json),
    })),
  };
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export interface ChatResult {
  ok: boolean;
  text?: string;
  error?: string;
  usedWebSearch?: boolean;
}

/** Call the Anthropic Messages API (non-streaming). Web search runs server-side. */
export async function callAnthropic(opts: {
  model: string;
  question: string;
  context: any;
  useWebSearch: boolean;
}): Promise<ChatResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: 'no-key' };

  const tools = opts.useWebSearch
    ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
    : undefined;

  const userContent = `Here is my current financial data (computed by the app — trust these numbers):\n\n\`\`\`json\n${JSON.stringify(
    opts.context,
    null,
    2,
  )}\n\`\`\`\n\nMy question: ${opts.question}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model || 'claude-opus-4-8',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Anthropic API ${res.status}: ${body.slice(0, 300)}` };
    }
    const data: any = await res.json();
    const text = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();
    const usedWebSearch = (data.content || []).some(
      (b: any) => b.type === 'server_tool_use' || b.type === 'web_search_tool_result',
    );
    return { ok: true, text: text || '(no text returned)', usedWebSearch };
  } catch (e: any) {
    return { ok: false, error: 'network: ' + e.message };
  }
}
