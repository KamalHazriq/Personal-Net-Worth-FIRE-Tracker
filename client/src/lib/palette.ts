// Colours for categories / subtypes used across charts. Stable across themes.
export const CATEGORY_COLORS: Record<string, string> = {
  'Cash/Bank': '#4f8cff',
  Bank: '#4f8cff',
  Stocks: '#2ec27e',
  Gold: '#f5b301',
  Crypto: '#a06bff',
  EPF: '#8b97ab',
  ASB: '#19b3a6',
  Wahed: '#ff8a5c',
  MMF: '#5bc0eb',
  HYSA: '#7aa2ff',
  Other: '#6b7787',
};

export const GAIN = '#2ec27e';
export const LOSS = '#f6685e';
export const ACCENT = '#4f8cff';
export const LOCKED = '#8b97ab';

export function colorFor(label: string): string {
  return CATEGORY_COLORS[label] || '#6b7787';
}

// A fixed order for stacking so the chart is stable month to month.
export const STACK_ORDER = ['Cash/Bank', 'Bank', 'ASB', 'Stocks', 'Gold', 'Crypto', 'Wahed', 'Other', 'EPF'];
