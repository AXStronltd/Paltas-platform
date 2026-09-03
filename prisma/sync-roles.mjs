/**
 * Bring existing organisations' system roles up to date with system-roles.json.
 *
 * The gap this closes: the seed creates roles from that file, but it only ever
 * runs on an empty database. Adding a permission to a system role therefore
 * reached new deployments and no existing ones — a live platform manager kept
 * being refused a permission the code had granted them weeks earlier.
 *
 * Two rules, both deliberate:
 *
 *   It only ever ADDS. A permission missing from the file is left alone rather
 *   than removed, because an owner may have deliberately revoked it from a
 *   system role in their organisation, and a deploy must not silently
 *   re-grant — or silently strip — authority someone chose.
 *
 *   It only touches roles marked isSystem. Roles an owner created are theirs.
 *
 * Run with: npm run db:sync-roles
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROLES = JSON.parse(readFileSync(join(here, "../src/lib/security/system-roles.json"), "utf8"));

async function main() {
  const roles = await prisma.role.findMany({
    where: { isSystem: true },
    include: { permissions: true, org: { select: { name: true } } },
  });

  let added = 0;
  const byRole = new Map();

  for (const role of roles) {
    const def = SYSTEM_ROLES.find((d) => d.key === role.key);
    if (!def) continue;

    const have = new Set(role.permissions.map((p) => p.permission));
    const missing = def.permissions.filter((p) => !have.has(p));
    if (missing.length === 0) continue;

    await prisma.rolePermission.createMany({
      data: missing.map((permission) => ({ roleId: role.id, permission })),
      skipDuplicates: true,
    });
    added += missing.length;
    const label = `${role.org?.name ?? "?"} · ${role.name}`;
    byRole.set(label, missing);
  }

  if (added === 0) {
    console.log("Every system role already matches system-roles.json.");
  } else {
    console.log(`Added ${added} missing permission(s):`);
    for (const [label, perms] of byRole) {
      console.log(`  ${label}`);
      for (const p of perms) console.log(`      + ${p}`);
    }
    console.log("\nNothing was removed. Revoked permissions stay revoked.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
