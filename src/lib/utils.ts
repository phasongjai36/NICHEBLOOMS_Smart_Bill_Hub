import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const baht = (n: number) =>
  '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });

export const thDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
};

export const thDateTime = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

export const METHOD_LABEL: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  promptpay: 'พร้อมเพย์',
  other: 'อื่น ๆ',
};

export const METHOD_ICON: Record<string, string> = {
  cash: '💵',
  transfer: '🏦',
  promptpay: '📱',
  other: '▪️',
};

export function daysDiff(fromIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00').getTime();
  const now = new Date(new Date().toDateString()).getTime();
  return Math.round((now - from) / 86400000);
}
