import { headers } from "next/headers";
import { prisma } from "./db";
import type { Actor } from "@/lib/security/types";

/**
 * The audit trail.
 *
 * Every consequential action records who did it, what they did, which part of
 * the portfolio it touched, when, and — where a value changed — what it was
 * before and what it is now. Refusals are recorded too: an attempt to suspend a
 * card without the permission is exactly the kind of thing an owner reviewing
 * the log wants to see.
 *
 * `changes()` keeps the log readable by storing only the fields that actually
 * moved, rather than two copies of a whole row.
 */

export interface AuditInput {
  actor: Actor;
  /** Dotted verb, e.g. "card.suspend" — matches the permission where there is one. */
  action: string;
  permission?: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  buildingId?: string | null;
  unitId?: string | null;
  /** One line, written for a human reading the trail. */
  summary: string;
  before?: unknown;
  after?: unknown;
}

function requestMeta() {
  try {
    const h = headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    };
  } catch {
    // Outside a request context (seeding, scripts) there is nothing to record.
    return {};
  }
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const meta = requestMeta();
  const primaryRole = input.actor.isOwner
    ? "Property Owner"
    : input.actor.roles[0]?.name ?? "Staff";

  await prisma.auditLog.create({
    data: {
      orgId: input.actor.orgId,
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorRole: primaryRole,
      action: input.action,
      permission: input.permission,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      propertyId: input.propertyId ?? null,
      buildingId: input.buildingId ?? null,
      unitId: input.unitId ?? null,
      summary: input.summary,
      before: (input.before ?? undefined) as never,
      after: (input.after ?? undefined) as never,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

/** A refused attempt. Written on every 403 so the trail shows what was tried. */
export async function writeAuditDenial(input: {
  actor: Actor;
  permission: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  reason: string;
}): Promise<void> {
  await writeAudit({
    actor: input.actor,
    action: "access.denied",
    permission: input.permission,
    entityType: input.entityType,
    entityId: input.entityId,
    propertyId: input.propertyId,
    summary: `Denied "${input.permission}" — ${input.reason}`,
  });
}

/**
 * The subset of fields that changed, as a before/after pair. Fields listed in
 * `redact` are recorded as having changed without recording the values, which is
 * how password hashes and QR tokens stay out of the log.
 */
export function changes<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  redact: string[] = [],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const oldValue = before[key];
    const newValue = after[key];
    if (serialise(oldValue) === serialise(newValue)) continue;
    if (redact.includes(key)) {
      b[key] = "«redacted»";
      a[key] = "«redacted»";
      continue;
    }
    b[key] = normalise(oldValue);
    a[key] = normalise(newValue);
  }
  return { before: b, after: a };
}

const serialise = (v: unknown) => JSON.stringify(normalise(v));
const normalise = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
