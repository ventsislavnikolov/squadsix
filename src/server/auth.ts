// The one admin account. Credentials live in environment variables, never in the code:
//
//   ADMIN_EMAIL           the admin's email
//   ADMIN_PASSWORD_HASH   scrypt:<salt hex>:<hash hex>   (make one: node scripts/hash-password.mjs)
//   SESSION_SECRET        any long random string; signs the session cookie
//
// The session is a signed, httpOnly cookie holding only its own expiry. Server-only.

import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { requireEnv } from "./db";

const COOKIE = "s6_admin";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function checkCredentials(email: string, password: string): boolean {
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedEmail || !stored) return false;

  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);

  // Compare both, always, so a wrong email takes as long as a wrong password.
  const emailOk = safeEqual(email.trim().toLowerCase(), expectedEmail);
  const passwordOk = timingSafeEqual(actual, expected);
  return emailOk && passwordOk;
}

export function startSession() {
  const expires = Math.floor(Date.now() / 1000) + THIRTY_DAYS;
  setCookie(COOKIE, `${expires}.${sign(String(expires))}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export function endSession() {
  deleteCookie(COOKIE, { path: "/" });
}

export function isAdmin(): boolean {
  const value = getCookie(COOKIE);
  if (!value || !process.env.SESSION_SECRET) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature) return false;
  if (!safeEqual(signature, sign(expires))) return false;
  return Number(expires) > Date.now() / 1000;
}

export function requireAdmin() {
  if (!isAdmin()) throw new Error("admin-only");
}

function sign(value: string): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET")).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
