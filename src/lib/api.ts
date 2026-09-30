import { Customer, Contract, Payment, Settings, Bill, Installment } from '../types';

const TOKEN_KEY = 'nb_bill_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401) clearToken();
    throw new ApiError(body?.error || `คำขอล้มเหลว (HTTP ${res.status})`, res.status);
  }
  return body as T;
}

export const api = {
  signIn: (password: string) => request<{ token: string }>('/api/auth/signin', { method: 'POST', body: JSON.stringify({ password }) }),
  signOut: () => request<{ ok: true }>('/api/auth/signout', { method: 'POST' }),
  changePassword: (current: string, next: string) => request<{ ok: true }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current, next }) }),

  overview: () => request<Overview>('/api/overview'),
  collect: (month?: string) => request<CollectResponse>(`/api/collect${month ? '?month=' + month : ''}`),
  customers: () => request<CustomerWithSummary[]>('/api/customers'),
  customer: (id: string) => request<CustomerDetail>(`/api/customers/${id}`),
  addCustomer: (c: Partial<Customer>) => request<CustomerWithSummary>('/api/customers', { method: 'POST', body: JSON.stringify(c) }),
  updateCustomer: (id: string, c: Partial<Customer>) => request<CustomerWithSummary>(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  deleteCustomer: (id: string) => request<{ ok: true }>(`/api/customers/${id}`, { method: 'DELETE' }),

  addContract: (c: NewContractInput) => request<Contract>('/api/contracts', { method: 'POST', body: JSON.stringify(c) }),
  closeContract: (id: string) => request<{ ok: true }>(`/api/contracts/${id}/close`, { method: 'PUT' }),
  reopenContract: (id: string) => request<{ ok: true }>(`/api/contracts/${id}/reopen`, { method: 'PUT' }),
  editInstallment: (contractId: string, no: number, patch: { dueDate?: string; amount?: number }) =>
    request<Installment>(`/api/installments/${contractId}/${no}`, { method: 'PUT', body: JSON.stringify(patch) }),

  recordPayment: (p: NewPaymentInput) => request<Payment>('/api/payments', { method: 'POST', body: JSON.stringify(p) }),
  deletePayment: (id: string) => request<{ ok: true }>(`/api/payments/${id}`, { method: 'DELETE' }),
  payments: (q?: { customerId?: string; month?: string }) => {
    const params = new URLSearchParams();
    if (q?.customerId) params.set('customerId', q.customerId);
    if (q?.month) params.set('month', q.month);
    const qs = params.toString();
    return request<PaymentRow[]>(`/api/payments${qs ? '?' + qs : ''}`);
  },

  previewBill: (contractId: string, installmentNos: number[]) =>
    request<{ bill: Bill; messageText: string }>('/api/bills/preview', { method: 'POST', body: JSON.stringify({ contractId, installmentNos }) }),
  previewCustomerBill: (customerId: string) =>
    request<{ bill: Bill; messageText: string }>('/api/bills/preview-customer', { method: 'POST', body: JSON.stringify({ customerId }) }),
  qrDataUrl: (payload: string) => request<{ dataUrl: string }>('/api/bills/qr', { method: 'POST', body: JSON.stringify({ payload }) }),

  settings: () => request<Settings>('/api/settings'),
  saveSettings: (s: Partial<Settings>) => request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  backup: () => request<{ ok: true; file: string }>('/api/backup', { method: 'POST' }),
  restore: (json: string) => request<{ ok: true }>('/api/restore', { method: 'POST', body: JSON.stringify({ json }) }),
};

// --------------- shapes returned by the server ---------------
export interface CollectRow {
  contractId: string;
  customerId: string;
  customerName: string;
  item: string;
  period: number;
  totalPeriods: number;
  dueDay: number;
  dueDate: string;
  amount: number;
  overdueDays: number;
  totalDue: number;
}

export interface CollectResponse {
  month: string;
  rows: CollectRow[];
}

export interface Overview {
  today: string;
  stats: {
    collectedThisMonth: number;
    overdueTotal: number;
    overdueCount: number;
    upcomingCount: number;
    activeCustomers: number;
    activeContracts: number;
  };
  overdue: QueueRow[];
  upcoming: QueueRow[];
  trend: { month: string; amount: number }[];
}

export interface QueueRow {
  contractId: string;
  customerId: string;
  customerName: string;
  item: string;
  period: number;
  totalPeriods: number;
  dueDate: string;
  amount: number;
  overdueDays: number;
  totalDue: number;
}

export interface CustomerWithSummary extends Customer {
  dueCount: number;
  overdueCount: number;
  dueTotal: number;
  activeContracts: number;
}

export interface CustomerDetail extends CustomerWithSummary {
  contracts: Contract[];
  payments: Payment[];
}

export interface NewContractInput {
  customerId: string;
  item: string;
  monthlyAmount: number;
  totalPeriods: number;
  dueDay: number;
  downPayment: number;
  startDate: string;
  note?: string;
}

export interface NewPaymentInput {
  contractId: string;
  installmentNo: number;
  amount: number;
  lateFee: number;
  method: PayMethod;
  note?: string;
}

export type PayMethod = 'cash' | 'transfer' | 'promptpay' | 'other';

export interface PaymentRow extends Payment {
  customerName: string;
  item: string;
}
