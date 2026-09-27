import { describe, expect, it } from 'vitest';
import {
  type EncryptedEnvelope,
  WrongPassphraseError,
  createSession,
  isEncryptedEnvelope,
  seal,
  unseal,
} from './encryption';

// Real iteration counts take most of a second each; the maths is the same.
const FAST = 1_000;
const DOC = JSON.stringify({ schemaVersion: 2, name: 'Household', years: { '2026': {} } });

async function sealed(passphrase = 'correct horse', plaintext = DOC) {
  const session = await createSession(passphrase, FAST);
  return JSON.parse(await seal(session, plaintext)) as EncryptedEnvelope;
}

describe('passphrase encryption', () => {
  it('round-trips with the right passphrase', async () => {
    const envelope = await sealed();
    const { plaintext } = await unseal(envelope, 'correct horse');
    expect(plaintext).toBe(DOC);
  });

  it('leaves nothing readable in the file', async () => {
    const text = JSON.stringify(await sealed());
    expect(text).not.toContain('Household');
    expect(text).not.toContain('schemaVersion');
  });

  it('rejects a wrong passphrase', async () => {
    const envelope = await sealed();
    await expect(unseal(envelope, 'correct horsf')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('rejects altered ciphertext', async () => {
    const envelope = await sealed();
    const bytes = Uint8Array.from(atob(envelope.data), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    envelope.data = btoa(String.fromCharCode(...bytes));
    await expect(unseal(envelope, 'correct horse')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('uses a fresh IV on every save but keeps the salt', async () => {
    const session = await createSession('correct horse', FAST);
    const a = JSON.parse(await seal(session, DOC)) as EncryptedEnvelope;
    const b = JSON.parse(await seal(session, DOC)) as EncryptedEnvelope;
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.data).not.toBe(b.data);
    expect(a.kdf.salt).toBe(b.kdf.salt);
  });

  it('returns a session whose saves open with the same passphrase', async () => {
    const { session } = await unseal(await sealed(), 'correct horse');
    const resaved = JSON.parse(await seal(session, 'updated')) as EncryptedEnvelope;
    expect((await unseal(resaved, 'correct horse')).plaintext).toBe('updated');
  });

  it('treats composed and decomposed accents as the same passphrase', async () => {
    const envelope = await sealed('café au lait');
    const { plaintext } = await unseal(envelope, 'café au lait');
    expect(plaintext).toBe(DOC);
  });

  it('handles a budget larger than one base64 chunk', async () => {
    const big = 'x'.repeat(200_000);
    expect((await unseal(await sealed('pw', big), 'pw')).plaintext).toBe(big);
  });

  it('refuses a format version it does not know', async () => {
    const envelope = { ...(await sealed()), version: 99 };
    await expect(unseal(envelope, 'correct horse')).rejects.toThrow(/newer version/);
  });

  it('refuses damaged key settings instead of deriving forever', async () => {
    const envelope = await sealed();
    envelope.kdf.iterations = 1e12;
    await expect(unseal(envelope, 'correct horse')).rejects.toThrow(/damaged/);
  });

  it('tells an envelope from a plain budget', async () => {
    expect(isEncryptedEnvelope(await sealed())).toBe(true);
    expect(isEncryptedEnvelope(JSON.parse(DOC))).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
  });
});
