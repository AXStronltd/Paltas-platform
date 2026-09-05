import { prisma } from "@/server/db";
import { storageEnabled } from "@/server/storage";

/**
 * Whether an account's identity has actually been checked.
 *
 * Separate from whether it can sign in, and deliberately so. Since onboarding
 * activates an account itself, "can work" and "has been verified" stopped being
 * the same question: somebody gets their dashboard the moment they finish the
 * form, and does whatever they like inside their own organisation, because
 * nobody else can see any of it. Publishing to the shopfront is different —
 * that is a stranger's money against a property nobody has confirmed exists.
 *
 * So this gates the shopfront, not the door.
 */

export type DocumentType = "IDENTITY" | "OWNERSHIP" | "SUPPORTING";

/**
 * What each role has to produce.
 *
 * A landlord claims to own something, so ownership evidence is asked for on
 * top of identity. A resident is claiming to live somewhere, which is not a
 * claim over anybody's property, and demanding a title deed for it would be
 * asking for a document that does not exist.
 */
export function requiredDocuments(role: string | null): DocumentType[] {
  if (role === "resident") return [];
  if (role === "landlord") return ["IDENTITY", "OWNERSHIP"];
  return ["IDENTITY"];
}

export interface VerificationState {
  verified: boolean;
  /** What is still outstanding, for a message somebody can act on. */
  missing: DocumentType[];
  /** True when the platform cannot accept documents at all. */
  unavailable: boolean;
}

/**
 * Has this account produced, and had approved, everything its role requires?
 *
 * When object storage is unconfigured this returns verified: true, and that is
 * not a loophole but the only honest answer. The upload endpoint returns 503
 * in that state, so no document can be produced by anybody; treating that as
 * "unverified" would close the shopfront to every host on the platform over a
 * missing environment variable, which is a worse failure than the one it
 * prevents. The flag says which case it is, so a caller can tell "checked and
 * fine" from "could not check".
 */
export async function verificationOf(userId: string): Promise<VerificationState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingRole: true },
  });
  /*
   * The onboarded role, and deliberately not the requested one.
   *
   * requestedRole is what a signup form was told; onboardingRole is what the
   * person confirmed on a form that also asked for the evidence. Falling back
   * to the first looked harmless and quietly changed the approval contract:
   * an account that signed up as a landlord but never onboarded began owing
   * ownership evidence it had never been asked for, and the approval suite
   * refused four checks that had passed for months.
   *
   * A self-activated account always has onboardingRole set — completing the
   * form is what sets it — so the publish gate loses nothing here.
   */
  const required = requiredDocuments(user?.onboardingRole ?? null);
  if (required.length === 0) return { verified: true, missing: [], unavailable: false };
  if (!storageEnabled()) return { verified: true, missing: [], unavailable: true };

  const approved = await prisma.verificationDocument.findMany({
    where: { userId, status: "APPROVED" },
    select: { type: true },
  });
  const have = new Set(approved.map((d) => d.type));
  const missing = required.filter((type) => !have.has(type));
  return { verified: missing.length === 0, missing, unavailable: false };
}

/**
 * The same question, asked at the shopfront rather than at the approval queue.
 *
 * The two are not interchangeable, and conflating them broke both. An approver
 * must always see the documents — that is the entire job, and skipping it for
 * an account that has not onboarded turns the queue into a rubber stamp. The
 * publish gate is standing in for an approver who was never consulted, so it
 * applies only where nobody was: an account carrying an approvedById was let in
 * by a person, and an account with no onboardingCompletedAt never went through
 * the self-activating form at all — it was seeded, or invited by an owner from
 * the Staff screen. Refusing to let a long-standing host publish would be a
 * regression dressed as a safeguard.
 *
 * Both mistakes were caught by suites rather than by reading: the publishing
 * checks failed when this gate was too wide, and the approval checks failed
 * when the exemption leaked into the queue.
 */
export async function publishVerification(userId: string): Promise<VerificationState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompletedAt: true, approvedById: true },
  });
  const selfActivated = Boolean(user?.onboardingCompletedAt) && !user?.approvedById;
  if (!selfActivated) return { verified: true, missing: [], unavailable: false };
  return verificationOf(userId);
}

/** Wording a host can act on, rather than a refusal they have to interpret. */
export function verificationMessage(missing: DocumentType[]): string {
  const names = missing.map((type) =>
    type === "IDENTITY" ? "an identity document"
      : type === "OWNERSHIP" ? "proof of ownership"
        : "a supporting document");
  return `Your account is not verified yet. Upload ${names.join(" and ")} on your onboarding page — `
    + "PALTAS reviews it before a listing can go on the public marketplace. "
    + "Everything else in your dashboard works meanwhile.";
}
