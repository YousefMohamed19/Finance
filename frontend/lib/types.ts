export interface Jar {
  _id: string;
  key: string;
  name: string;
  icon: string;
  remainder: boolean;
  percentBp: number;
  balance: number;
}

export interface Dashboard {
  allocationVersion: number;
  jars: Jar[];
  total: number;
  pendingDrafts: number;
  unreadNotifications: number;
}

export interface Me {
  id: string;
  email: string;
  currency: string;
  timezone: string;
  reminderHour: number;
  remindersEnabled: boolean;
  totpEnabled: boolean;
  hasPin: boolean;
  telegramLinked: boolean;
}

export interface Tx {
  _id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  jar?: string;
  fromJar?: string;
  toJar?: string;
  splits?: { jar: string; amount: number }[];
  counterparty?: { _id: string; name: string; kind: string } | null;
  note?: string;
  origin: string;
  deletedAt: string | null;
}

export interface Draft {
  _id: string;
  raw: string;
  type: 'income' | 'expense';
  amount?: number;
  jarKey?: string;
  counterparty?: string;
  date: string;
  confidence: number;
  reasons: string[];
  origin: string;
}
