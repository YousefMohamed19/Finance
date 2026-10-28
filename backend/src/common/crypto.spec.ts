import { encrypt, decrypt, blindIndex } from './crypto';

process.env.FIELD_ENCRYPTION_KEY = 'a'.repeat(64);

describe('field encryption', () => {
  it('round-trips and never stores plain text', () => {
    const enc = encrypt('Freelance client Ahmed')!;
    expect(enc).not.toContain('Ahmed');
    expect(decrypt(enc)).toBe('Freelance client Ahmed');
    expect(encrypt('x')).not.toBe(encrypt('x'));
  });
  it('builds a stable, case-insensitive blind index', () => {
    expect(blindIndex(' Uber ')).toBe(blindIndex('uber'));
  });
});
