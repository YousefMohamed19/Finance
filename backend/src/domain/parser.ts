/**
 * Rule-based quick-add parser. Runs entirely on the server: no AI model, no API keys, no tokens.
 *
 * Understands short English/Egyptian-Arabic entries such as:
 *   "uber 85", "netflix 120 yesterday", "got 5000 from freelance client Ahmed",
 *   "salary 25k", "lunch 150 #fun", "اوبر ٨٥", "قبضت ٥٠٠٠ من احمد"
 * and pasted bank SMS such as "Your card was charged EGP 250.00 at CARREFOUR on 12/10/2026".
 *
 * It also "learns" without AI: once you confirm "uber" -> Transport, the counterparty remembers its jar
 * and the next "uber 60" is saved with full confidence.
 */

export type EntryType = 'income' | 'expense';

export interface KnownCounterparty {
  name: string;
  defaultJarKey?: string | null;
}

export interface JarRef {
  key: string;
  name: string;
}

export interface ParseContext {
  now: Date;
  jars: JarRef[];
  counterparties: KnownCounterparty[];
}

export interface ParsedEntry {
  type: EntryType;
  amount: number | null; // minor units (piasters)
  jarKey: string | null;
  counterparty: string | null;
  date: string; // YYYY-MM-DD
  note: string;
  confidence: number; // 0..1
  reasons: string[];
}

/** Entries at or above this confidence are saved directly; anything below goes to the drafts inbox. */
export const AUTO_SAVE_CONFIDENCE = 0.7;

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Keyword -> jar key. Matched as whole words, case-insensitive. Users can override per counterparty. */
export const JAR_KEYWORDS: Record<string, string[]> = {
  transport: [
    'uber', 'careem', 'didi', 'indrive', 'swvl', 'taxi', 'cab', 'metro', 'bus', 'train', 'microbus',
    'fuel', 'gas', 'petrol', 'benzine', 'parking', 'toll', 'car wash', 'mechanic',
    'اوبر', 'أوبر', 'كريم', 'تاكسي', 'مترو', 'اتوبيس', 'بنزين', 'جراج', 'مواصلات', 'ميكروباص',
  ],
  fun: [
    'netflix', 'spotify', 'shahid', 'osn', 'youtube', 'cinema', 'movie', 'game', 'games', 'playstation',
    'steam', 'restaurant', 'cafe', 'coffee', 'starbucks', 'pizza', 'burger', 'mcdonalds', 'kfc',
    'lunch', 'dinner', 'outing', 'party', 'concert', 'trip', 'vacation',
    'نتفليكس', 'سينما', 'مطعم', 'قهوة', 'كافيه', 'خروجة', 'فسحة', 'رحلة',
  ],
  god: [
    'charity', 'sadaqa', 'sadaqah', 'zakat', 'zakah', 'donation', 'donate', 'mosque', 'church',
    'صدقة', 'زكاة', 'تبرع', 'مسجد', 'خير',
  ],
  emergency: [
    'doctor', 'hospital', 'pharmacy', 'medicine', 'clinic', 'dentist', 'repair', 'emergency',
    'دكتور', 'مستشفى', 'صيدلية', 'دواء', 'علاج', 'طوارئ', 'تصليح',
  ],
  big: ['car', 'phone', 'iphone', 'laptop', 'tv', 'fridge', 'furniture', 'عربية', 'موبايل', 'لابتوب', 'تلاجة'],
  future: ['course', 'udemy', 'coursera', 'domain', 'hosting', 'server', 'invest', 'investment', 'stocks', 'كورس', 'استثمار'],
  me: [
    'groceries', 'grocery', 'supermarket', 'carrefour', 'clothes', 'haircut', 'barber', 'gym', 'rent',
    'electricity', 'internet', 'vodafone', 'etisalat', 'bills',
    'سوبرماركت', 'هدوم', 'حلاق', 'جيم', 'ايجار', 'إيجار', 'كهرباء', 'نت', 'فاتورة',
  ],
};

const INCOME_WORDS = [
  'got', 'get', 'received', 'receive', 'recieved', 'salary', 'earned', 'earn', 'income', 'bonus',
  'commission', 'refund', 'credited', 'deposit', 'deposited', 'paid me', 'payment from', 'sold',
  'قبضت', 'استلمت', 'مرتب', 'راتب', 'دخل', 'جالي', 'جاني', 'إيداع', 'ايداع', 'مكافأة', 'بعت',
];
const EXPENSE_WORDS = [
  'spent', 'paid', 'pay', 'bought', 'buy', 'charged', 'debited', 'purchase', 'withdrawn', 'withdrawal',
  'دفعت', 'اشتريت', 'صرفت', 'خصم', 'سحب', 'شراء',
];
const STOP_WORDS = new Set([
  'got', 'get', 'received', 'receive', 'recieved', 'earned', 'earn', 'from', 'to', 'at', 'for', 'on', 'in',
  'the', 'a', 'an', 'my', 'of', 'with', 'and', 'paid', 'pay', 'spent', 'bought', 'buy', 'egp', 'le', 'l.e',
  'pounds', 'pound', 'gnh', 'جنيه', 'ج', 'ج.م', 'من', 'على', 'في', 'ل', 'دفعت', 'قبضت', 'استلمت', 'صرفت',
  'اشتريت', 'today', 'yesterday', 'your', 'card', 'account', 'was', 'has', 'been', 'is', 'with', 'by',
  'transaction', 'amount', 'ending', 'balance', 'available', 'avl', 'bal', 'dear', 'customer', 'via', 'pos',
  'charged', 'debited', 'credited', 'purchase', 'withdrawn', 'deposit', 'deposited', 'me', 'you', 'رصيد',
  'عميلنا', 'العزيز', 'بطاقة', 'حساب', 'تم', 'مبلغ',
]);

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, الاحد: 0, الأحد: 0,
  monday: 1, mon: 1, الاثنين: 1, الإثنين: 1, الاتنين: 1,
  tuesday: 2, tue: 2, الثلاثاء: 2, التلات: 2,
  wednesday: 3, wed: 3, الاربعاء: 3, الأربعاء: 3, الاربع: 3,
  thursday: 4, thu: 4, الخميس: 4,
  friday: 5, fri: 5, الجمعة: 5, الجمعه: 5,
  saturday: 6, sat: 6, السبت: 6,
};

export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word match that also works for Arabic (where \b does not apply). */
function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

function removeSpan(text: string, match: RegExpExecArray): string {
  return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
}

interface Extracted<T> {
  value: T;
  rest: string;
}

function extractDate(text: string, now: Date): Extracted<Date | null> {
  const rules: Array<[RegExp, (m: RegExpExecArray) => Date | null]> = [
    [/(\d{4})-(\d{1,2})-(\d{1,2})/, (m) => new Date(+m[1], +m[2] - 1, +m[3])],
    [
      /(?:^|\s)(?:on\s+)?(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{2,4}))?|\.(\d{1,2})\.(\d{2,4}))(?=\s|$)/,
      (m) => {
        // Day-first, as used in Egypt and most of the world. Dots need a year so "45.5" stays an amount.
        const day = +m[1];
        const month = +(m[2] ?? m[4]);
        const yearText = m[3] ?? m[5];
        if (day < 1 || day > 31 || month < 1 || month > 12) return null;
        let year = yearText ? +yearText : now.getFullYear();
        if (year < 100) year += 2000;
        const d = new Date(year, month - 1, day);
        if (!yearText && d > now) d.setFullYear(year - 1);
        return d;
      },
    ],
    [/day before yesterday|اول امبارح|أول امبارح|أول أمس/i, () => addDays(now, -2)],
    [/yesterday|امبارح|إمبارح|أمس|امس/i, () => addDays(now, -1)],
    [/today|النهارده|النهاردة|اليوم/i, () => now],
    [
      /(?<![\p{L}])(?:last\s+|on\s+|يوم\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat|الأحد|الاحد|الاثنين|الإثنين|الاتنين|الثلاثاء|التلات|الاربعاء|الأربعاء|الاربع|الخميس|الجمعة|الجمعه|السبت)(?=\s|$)/iu,
      (m) => {
        const target = WEEKDAYS[m[1].toLowerCase()];
        let diff = now.getDay() - target;
        if (diff <= 0) diff += 7;
        return addDays(now, -diff);
      },
    ],
  ];
  for (const [re, toDate] of rules) {
    const m = re.exec(text);
    if (m) {
      const d = toDate(m);
      if (d && !Number.isNaN(d.getTime())) return { value: d, rest: removeSpan(text, m) };
    }
  }
  return { value: null, rest: text };
}

function extractAmount(text: string): Extracted<number | null> {
  const re = /(?:^|[^\p{L}\p{N}.])([+-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k|K|ك|ألف|الف|alf)?(?=$|[^\p{L}\p{N}]|\s)/u;
  const m = re.exec(text);
  if (!m) return { value: null, rest: text };
  const whole = Number(m[2].replace(/,/g, ''));
  const fraction = m[3] ? Number(m[3].padEnd(2, '0')) : 0;
  let minor = whole * 100 + fraction;
  if (m[4]) minor *= 1000;
  return { value: minor > 0 ? minor : null, rest: removeSpan(text, m) };
}

function titleCase(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => (/^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1) : w));
}

function cleanWords(text: string): string[] {
  return text
    .split(/[\s,;:!?()"']+/)
    .map((w) => w.trim())
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()) && !/^[+\-#*.]+$/.test(w));
}

function findJarTag(text: string, jars: JarRef[]): Extracted<string | null> {
  const m = /#(\p{L}[\p{L}\p{N}_-]*)/u.exec(text);
  if (!m) return { value: null, rest: text };
  const tag = m[1].toLowerCase();
  const jar = jars.find(
    (j) => j.key.toLowerCase() === tag || j.name.toLowerCase().replace(/\s+/g, '') === tag || j.name.toLowerCase().split(/\s+/)[0] === tag,
  );
  return jar ? { value: jar.key, rest: removeSpan(text, m) } : { value: null, rest: text };
}

function findCounterparty(text: string, type: EntryType): string | null {
  // Explicit "from X" / "at X" / "to X" phrases first.
  const phrase =
    type === 'income'
      ? /(?:from|by|من)\s+(.+)$/iu.exec(text)
      : /(?:\bat\b|\bto\b|عند|لدى|في)\s+(.+?)(?:\s+(?:on|for)\s|$)/iu.exec(text);
  const source = phrase ? phrase[1] : text;
  const words = cleanWords(source).filter((w) => !INCOME_WORDS.includes(w.toLowerCase()) && !/^\d/.test(w));
  if (words.length === 0) return null;
  return titleCase(words.slice(0, 4).join(' '));
}

function matchKnownCounterparty(text: string, known: KnownCounterparty[]): KnownCounterparty | null {
  // Prefer the longest name that appears in the text, so "Uber Eats" wins over "Uber".
  const sorted = [...known].sort((a, b) => b.name.length - a.name.length);
  return sorted.find((c) => c.name && hasWord(text, c.name.toLowerCase())) ?? null;
}

function guessJarByKeyword(text: string): string | null {
  for (const [jarKey, words] of Object.entries(JAR_KEYWORDS)) {
    if (words.some((w) => hasWord(text, w))) return jarKey;
  }
  return null;
}

export function parseEntry(input: string, ctx: ParseContext, opts: { bankMessage?: boolean } = {}): ParsedEntry {
  const reasons: string[] = [];
  const original = input.trim();
  let text = normalizeDigits(original).replace(/\s+/g, ' ').toLowerCase();

  const tag = findJarTag(text, ctx.jars);
  text = tag.rest;

  const date = extractDate(text, ctx.now);
  text = date.rest;

  // Card/account numbers are never the amount.
  text = text.replace(/(?:ending|ending with|no\.?|number|card|acct|account|رقم|المنتهية ب?)\s*[x*#]*\d+/giu, ' ');
  text = text.replace(/[x*]{2,}\d+/giu, ' ');

  // A number written next to a currency is the strongest amount signal.
  const currency = '(?:egp|e\\.g\\.p|l\\.e\\.?|le|جنيه|ج\\.م)';
  const nearCurrency = new RegExp(
    `(?<![\\p{L}])${currency}\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)|(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s*${currency}(?=\\s|$)`,
    'iu',
  ).exec(text);
  if (nearCurrency) text = `${(nearCurrency[1] ?? nearCurrency[2])} ${removeSpan(text, nearCurrency)}`;

  // Drop currency markers so "EGP 250" and "250 LE" both work.
  text = text.replace(/(?<![\p{L}])(?:egp|e\.g\.p|l\.e\.?|le|جنيه|ج\.م)(?=\s|\d|$)/giu, ' ');
  const amount = extractAmount(text);
  text = amount.rest.replace(/\s+/g, ' ').trim();

  const signedIncome = /^\s*\+/.test(original);
  const incomeHit = INCOME_WORDS.some((w) => hasWord(text, w));
  const expenseHit = EXPENSE_WORDS.some((w) => hasWord(text, w));
  const type: EntryType = signedIncome || (incomeHit && !expenseHit) ? 'income' : 'expense';

  const known = matchKnownCounterparty(text, ctx.counterparties);
  const counterparty = known ? known.name : findCounterparty(text, type);

  let jarKey: string | null = null;
  let confidence = 0;

  if (amount.value === null) {
    reasons.push('No amount found');
  } else if (type === 'income') {
    // Income is auto-split across all jars, so no jar is needed.
    confidence = counterparty ? 0.9 : 0.75;
    reasons.push(counterparty ? `Income from ${counterparty}` : 'Income with no source named');
  } else if (tag.value) {
    jarKey = tag.value;
    confidence = 0.95;
    reasons.push('Jar set with #tag');
  } else if (known?.defaultJarKey) {
    jarKey = known.defaultJarKey;
    confidence = 0.95;
    reasons.push(`Remembered jar for ${known.name}`);
  } else {
    jarKey = guessJarByKeyword(text);
    confidence = jarKey ? 0.8 : 0.4;
    reasons.push(jarKey ? `Keyword matched the ${jarKey} jar` : 'Could not tell which jar this belongs to');
  }

  if (type === 'income' && tag.value) jarKey = tag.value;

  if (opts.bankMessage) {
    // Bank messages are always confirmed by the user before they are saved.
    confidence = Math.min(confidence, AUTO_SAVE_CONFIDENCE - 0.01);
    reasons.push('Imported from a bank message');
  }

  return {
    type,
    amount: amount.value,
    jarKey,
    counterparty,
    date: toIsoDate(date.value ?? ctx.now),
    note: original,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}
