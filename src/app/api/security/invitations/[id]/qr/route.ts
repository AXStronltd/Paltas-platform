import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import { guard, handle, notFound } from "@/server/http";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * The QR pass itself, rendered as SVG.
 *
 * The token lives only inside the image and is re-checked at the gate, so a
 * screenshot of the pass is exactly as powerful as the pass — and no more, since
 * validity, use count and cancellation are all decided server-side on scan.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse | Response> {
  return handle(async () => {
    const invitation = await prisma.visitorInvitation.findUnique({
      where: { id: params.id },
      select: { id: true, unitId: true, qrToken: true, passCode: true, status: true },
    });
    if (!invitation) return notFound("Invitation not found.");

    const g = await guard(PERMISSIONS.INVITATION_VIEW, { unitId: invitation.unitId });
    if (!g.ok) return g.response;

    const svg = await QRCode.toString(`PALTAS:${invitation.qrToken}`, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        // A pass is personal and revocable; it must not sit in a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  });
}
