/**
 * Buyer and seller enquiries from people who are not signed in.
 *
 * The only write on the public site that needs no account. It sends an intent
 * and contact details; everything else — which organisation the lead belongs
 * to, what stage it starts at, who owns it — is decided on the server, because
 * a client that could set those could inject leads into anyone's pipeline.
 */

export interface EnquiryResult {
  received: true;
  intent: "buy" | "sell";
  message: string;
}

export interface Enquiry {
  intent: "buy" | "sell";
  name: string;
  email?: string;
  phone?: string;
  /** Set when asking about one specific listing. */
  listingId?: string;
  interestedIn?: string;
  budget?: number;
  city?: string;
  propertyType?: string;
  message?: string;
}

export async function submitEnquiry(
  input: Enquiry,
): Promise<{ data: EnquiryResult | null; error: string | null }> {
  try {
    const res = await fetch("/api/public/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { data: null, error: json?.error?.message ?? "That could not be sent. Please try again." };
    }
    return { data: json as EnquiryResult, error: null };
  } catch {
    return { data: null, error: "Could not reach the server. Please check your connection." };
  }
}
