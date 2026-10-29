import { parseEntry, ParseContext, AUTO_SAVE_CONFIDENCE } from './parser';
import { DEFAULT_JARS } from './jars';

// Wednesday 28 Oct 2026, 20:00 local time
const now = new Date(2026, 9, 28, 20, 0, 0);
const ctx = (counterparties: ParseContext['counterparties'] = []): ParseContext => ({
  now,
  jars: DEFAULT_JARS.map((j) => ({ key: j.key, name: j.name })),
  counterparties,
});

describe('parseEntry', () => {
  it('parses "uber 85" as a transport expense', () => {
    const r = parseEntry('uber 85', ctx());
    expect(r).toMatchObject({ type: 'expense', amount: 8500, jarKey: 'transport', counterparty: 'Uber', date: '2026-10-28' });
    expect(r.confidence).toBeGreaterThanOrEqual(AUTO_SAVE_CONFIDENCE);
  });

  it('parses income with a named source', () => {
    const r = parseEntry('got 5000 from freelance client Ahmed', ctx());
    expect(r).toMatchObject({ type: 'income', amount: 500000, counterparty: 'Freelance Client Ahmed', jarKey: null });
    expect(r.confidence).toBeGreaterThanOrEqual(AUTO_SAVE_CONFIDENCE);
  });

  it('understands k suffix, thousands separators and decimals', () => {
    expect(parseEntry('salary 25k', ctx()).amount).toBe(2500000);
    expect(parseEntry('laptop 32,500', ctx()).amount).toBe(3250000);
    expect(parseEntry('coffee 45.5', ctx()).amount).toBe(4550);
    expect(parseEntry('salary 25k', ctx()).type).toBe('income');
  });

  it('understands relative and explicit dates', () => {
    expect(parseEntry('netflix 120 yesterday', ctx()).date).toBe('2026-10-27');
    expect(parseEntry('pizza 300 on 12/10', ctx()).date).toBe('2026-10-12');
    expect(parseEntry('gas 600 2026-09-01', ctx()).date).toBe('2026-09-01');
    expect(parseEntry('cinema 200 last monday', ctx()).date).toBe('2026-10-26');
  });

  it('handles Arabic digits and words', () => {
    const r = parseEntry('اوبر ٨٥ امبارح', ctx());
    expect(r).toMatchObject({ type: 'expense', amount: 8500, jarKey: 'transport', date: '2026-10-27' });
    const inc = parseEntry('قبضت ٥٠٠٠ من احمد', ctx());
    expect(inc).toMatchObject({ type: 'income', amount: 500000, counterparty: 'احمد' });
  });

  it('remembers the jar of a known counterparty', () => {
    const r = parseEntry('Zooba 230', ctx([{ name: 'Zooba', defaultJarKey: 'fun' }]));
    expect(r).toMatchObject({ jarKey: 'fun', counterparty: 'Zooba', confidence: 0.95 });
  });

  it('lets a #tag pick the jar', () => {
    expect(parseEntry('gift for mom 500 #god', ctx())).toMatchObject({ jarKey: 'god', confidence: 0.95 });
    expect(parseEntry('book 90 #future', ctx()).jarKey).toBe('future');
  });

  it('sends unclear entries to drafts', () => {
    const r = parseEntry('stuff 300', ctx());
    expect(r.jarKey).toBeNull();
    expect(r.confidence).toBeLessThan(AUTO_SAVE_CONFIDENCE);
    expect(parseEntry('uber', ctx()).amount).toBeNull();
  });

  it('parses bank SMS into a draft', () => {
    const r = parseEntry(
      'Your card ending 4421 was charged EGP 250.00 at CARREFOUR on 12/10/2026',
      ctx(),
      { bankMessage: true },
    );
    expect(r).toMatchObject({ type: 'expense', amount: 25000, counterparty: 'Carrefour', jarKey: 'me', date: '2026-10-12' });
    expect(r.confidence).toBeLessThan(AUTO_SAVE_CONFIDENCE);

    const credit = parseEntry('Your account was credited with EGP 15,000.00 from ACME LTD', ctx(), { bankMessage: true });
    expect(credit).toMatchObject({ type: 'income', amount: 1500000, counterparty: 'Acme Ltd' });
  });
});
