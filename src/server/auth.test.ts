import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCredentials,
  endSession,
  isAdmin,
  requireAdmin,
  startSession,
} from "./auth";

const { jar, setCookie, deleteCookie } = vi.hoisted(() => {
  const cookies = new Map<string, string>();
  return {
    jar: cookies,
    setCookie: vi.fn((name: string, value: string) => {
      cookies.set(name, value);
    }),
    deleteCookie: vi.fn((name: string) => {
      cookies.delete(name);
    }),
  };
});

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => jar.get(name),
  setCookie,
  deleteCookie,
}));

const COOKIE = "s6_admin";
const SIGNED = /^\d+\./u;
const NOW = Date.parse("2026-11-04T12:00:00Z");

function hashOf(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

beforeEach(() => {
  jar.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SESSION_SECRET", "a-long-random-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("checkCredentials", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAIL", " Admin@Example.com ");
    vi.stubEnv("ADMIN_PASSWORD_HASH", hashOf("correct horse"));
  });

  it("accepts the admin's email, in any case, with the right password", () => {
    expect(checkCredentials("admin@example.COM ", "correct horse")).toBe(true);
  });

  it("refuses a wrong password or a wrong email", () => {
    expect(checkCredentials("admin@example.com", "wrong")).toBe(false);
    expect(checkCredentials("someone@example.com", "correct horse")).toBe(
      false
    );
  });

  it("refuses everyone while the credentials are not configured", () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    expect(checkCredentials("admin@example.com", "correct horse")).toBe(false);
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "");
    expect(checkCredentials("admin@example.com", "correct horse")).toBe(false);
  });

  it("refuses a stored hash in another format", () => {
    vi.stubEnv("ADMIN_PASSWORD_HASH", "bcrypt:aa:bb");
    expect(checkCredentials("admin@example.com", "correct horse")).toBe(false);
    vi.stubEnv("ADMIN_PASSWORD_HASH", "scrypt:aa");
    expect(checkCredentials("admin@example.com", "correct horse")).toBe(false);
  });
});

describe("the admin session", () => {
  it("is a signed cookie that makes the visitor the admin for 30 days", () => {
    startSession();
    expect(setCookie).toHaveBeenCalledWith(
      COOKIE,
      expect.stringMatching(SIGNED),
      expect.objectContaining({ httpOnly: true, secure: false, path: "/" })
    );
    expect(isAdmin()).toBe(true);
    expect(() => requireAdmin()).not.toThrow();

    vi.setSystemTime(NOW + 31 * 86_400_000);
    expect(isAdmin()).toBe(false);
  });

  it("is a secure cookie in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    startSession();
    expect(setCookie).toHaveBeenCalledWith(
      COOKIE,
      expect.any(String),
      expect.objectContaining({ secure: true })
    );
  });

  it("ends when the cookie is deleted", () => {
    startSession();
    endSession();
    expect(deleteCookie).toHaveBeenCalledWith(COOKIE, { path: "/" });
    expect(isAdmin()).toBe(false);
    expect(() => requireAdmin()).toThrow("admin-only");
  });

  it("does not trust a forged or malformed cookie", () => {
    startSession();
    const [expires] = (jar.get(COOKIE) ?? "").split(".");
    jar.set(COOKIE, `${expires}.forged-signature`);
    expect(isAdmin()).toBe(false);
    jar.set(COOKIE, "no-signature");
    expect(isAdmin()).toBe(false);
  });

  it("is off when the signing secret is missing", () => {
    startSession();
    vi.stubEnv("SESSION_SECRET", "");
    expect(isAdmin()).toBe(false);
  });
});
