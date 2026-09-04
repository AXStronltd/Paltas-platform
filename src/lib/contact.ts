/**
 * How to reach PALTAS, written once.
 *
 * The footer icon and the help page both need this, and a support number that
 * appears in two files is a number that will eventually disagree with itself.
 *
 * wa.me wants the number in international form with no plus and no separators,
 * so the display form is the source and the link is derived from it — not the
 * other way round, which would leave the readable version to be typed by hand.
 */
export const SUPPORT_EMAIL = "support@paltas.io";

/** International form, as a person would write it. */
export const SUPPORT_WHATSAPP = "+44 7770 726657";

export const whatsappHref = `https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, "")}`;
