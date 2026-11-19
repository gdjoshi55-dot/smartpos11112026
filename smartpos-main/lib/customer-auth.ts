import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const CUSTOMER_COOKIE = 'smartpos_customer';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface PublicCustomer {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

function sessionSecret(): string {
  return (
    process.env.CUSTOMER_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'smartpos-dev-customer-session'
  );
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = (stored || '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const derived = crypto.scryptSync(
      password,
      Buffer.from(saltHex, 'hex'),
      64
    );
    const expected = Buffer.from(hashHex, 'hex');
    return (
      derived.length === expected.length &&
      crypto.timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

export function createSessionToken(accountId: number): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${accountId}.${exp}`;
  const signature = crypto
    .createHmac('sha256', sessionSecret())
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

export function readSessionToken(
  token: string | null | undefined
): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [idPart, expPart, signature] = parts;
  const expected = crypto
    .createHmac('sha256', sessionSecret())
    .update(`${idPart}.${expPart}`)
    .digest('hex');

  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (
    provided.length !== wanted.length ||
    !crypto.timingSafeEqual(provided, wanted)
  ) {
    return null;
  }

  const exp = Number(expPart);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;

  const accountId = Number(idPart);
  return Number.isFinite(accountId) ? accountId : null;
}

export function getSessionAccountId(req: NextRequest): number | null {
  return readSessionToken(req.cookies.get(CUSTOMER_COOKIE)?.value);
}

export function attachCustomerCookie(
  res: NextResponse,
  accountId: number
): NextResponse {
  res.cookies.set({
    name: CUSTOMER_COOKIE,
    value: createSessionToken(accountId),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

export function clearCustomerCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: CUSTOMER_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export function toPublicCustomer(row: {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}): PublicCustomer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    address: row.address,
    created_at: row.created_at,
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Attach past guest orders/customer rows that used the same email to this
 * account so a new login immediately shows their order history. Best-effort:
 * failures must never block login.
 */
export async function linkCustomerHistory(
  admin: any,
  account: { id: number; email: string }
): Promise<void> {
  if (!account.email) return;
  try {
    await admin
      .from('orders')
      .update({ customer_account_id: account.id })
      .ilike('customer_email', account.email)
      .is('customer_account_id', null);
    await admin
      .from('customers')
      .update({ account_id: account.id })
      .ilike('email', account.email)
      .is('account_id', null);
  } catch (err) {
    console.error('Could not link past customer history:', err);
  }
}
