/**
 * Passphrase encryption for the budget file, using only WebCrypto.
 *
 * The encrypted file is still JSON — an envelope carrying everything needed to
 * decrypt except the passphrase — so it keeps its .json name, passes through
 * the same pickers, and syncs through OneDrive like any other file. Because the
 * key is derived from the passphrase and the salt stored in the file, the same
 * passphrase opens it on any machine.
 *
 * One salt per file, one fresh IV per save: the key is derived once per
 * session rather than on every autosave, which matters at 600k iterations.
 */

const FORMAT = 'budget-encrypted';
const VERSION = 1;

/** OWASP's current recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 600_000;

/** Refuse absurd counts from a damaged file rather than hang deriving a key. */
const MAX_ITERATIONS = 10_000_000;

export const MIN_PASSPHRASE_LENGTH = 8;

/** A new passphrase as typed: entered twice, since a typo would lock the budget for good. */
export interface PassphraseDraft {
  passphrase: string;
  confirm: string;
}

export const EMPTY_PASSPHRASE: PassphraseDraft = { passphrase: '', confirm: '' };

/** Why the draft cannot be used yet, or null when it can. */
export function passphraseProblem({ passphrase, confirm }: PassphraseDraft): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  }
  if (passphrase !== confirm) return 'The two entries do not match.';
  return null;
}

export interface EncryptedEnvelope {
  format: typeof FORMAT;
  version: number;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

/** A derived key and the parameters that produced it. Lives in memory only. */
export interface CipherSession {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

/**
 * AES-GCM cannot tell a wrong key from altered ciphertext, so this covers both.
 * In practice it is nearly always a mistyped passphrase.
 */
export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase did not unlock this budget.');
  }
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return typeof value === 'object' && value !== null && (value as { format?: unknown }).format === FORMAT;
}

export async function createSession(
  passphrase: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<CipherSession> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await deriveKey(passphrase, salt, iterations), salt, iterations };
}

export async function seal(session: CipherSession, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    session.key,
    new TextEncoder().encode(plaintext),
  );
  const envelope: EncryptedEnvelope = {
    format: FORMAT,
    version: VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: session.iterations, salt: toBase64(session.salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(data)),
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Decrypt, and hand back a session bound to this file's salt so later saves
 * stay openable with the same passphrase.
 */
export async function unseal(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Promise<{ plaintext: string; session: CipherSession }> {
  if (envelope.version !== VERSION) {
    throw new Error(
      `This budget was encrypted by a newer version of the app (format ${envelope.version}). ` +
        `Update the app to open it.`,
    );
  }

  const { iterations } = envelope.kdf ?? {};
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new Error('The encrypted budget file is damaged: its key settings are invalid.');
  }

  let salt: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>;
  try {
    salt = fromBase64(envelope.kdf.salt);
    iv = fromBase64(envelope.cipher.iv);
    data = fromBase64(envelope.data);
  } catch {
    throw new Error('The encrypted budget file is damaged and cannot be read.');
  }

  const key = await deriveKey(passphrase, salt, iterations);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    throw new WrongPassphraseError();
  }

  return {
    plaintext: new TextDecoder().decode(decrypted),
    session: { key, salt, iterations },
  };
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  // NFC so a passphrase with accents typed on one OS matches the same one typed
  // on another, where the keyboard may produce decomposed characters.
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: Uint8Array): string {
  // Chunked: spreading a whole budget into fromCharCode overflows the stack.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
