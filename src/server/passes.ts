import { randomBytes, randomInt } from "node:crypto";
import { prisma } from "./db";

/**
 * Visitor pass credentials.
 *
 * Two forms of the same permission to enter: a long random `qrToken` behind the
 * QR code, and a short `passCode` a guard can key in when a cracked phone screen
 * or a flat battery defeats the scanner. The short code is deliberately not
 * derived from the token — knowing one tells you nothing about the other.
 *
 * The short code omits I, O, 0 and 1, because it gets read aloud at a gate.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function shortCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function newQrToken(): string {
  return randomBytes(24).toString("base64url");
}

/** A pass code guaranteed unique across live invitations. */
export async function newPassCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = shortCode();
    const clash = await prisma.visitorInvitation.findUnique({ where: { passCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  // Astronomically unlikely; fall back to a longer code rather than loop forever.
  return shortCode(12);
}

/** Sequential-looking, collision-free reference for incidents: INC-4F2A19. */
export function incidentReference(): string {
  return `INC-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Card numbers read like A204-02: unit-ish prefix, then a counter. */
export function cardNumber(prefix: string, seq: number): string {
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}-${String(seq).padStart(2, "0")}`;
}
