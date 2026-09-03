import Link from "next/link";

export const metadata = {
  title: "Buy or sell property — PALTAS",
  description: "Find a property to buy, or list yours for sale with PALTAS.",
};

/**
 * The fork.
 *
 * Someone arriving at "Buy / Sell" wants one of two entirely different things,
 * and guessing which is how a page ends up serving neither. So it asks, and
 * each answer leads somewhere built for that person.
 */
export default function BuySellPage() {
  return (
    <main className="container choose">
      <h1 className="choose-title">Buying or selling?</h1>
      <p className="choose-sub">
        Tell us which, and we will put you in front of the right person.
      </p>

      <div className="choose-grid">
        <Link href="/buy" className="choose-card">
          <span className="choose-icon" aria-hidden="true">⌂</span>
          <b>I want to buy</b>
          <span>
            Browse homes, apartments and land for sale. Tell us what you are looking for and
            an agent will bring you matches.
          </span>
          <span className="choose-go">Browse properties →</span>
        </Link>

        <Link href="/sell" className="choose-card">
          <span className="choose-icon" aria-hidden="true">✦</span>
          <b>I want to sell</b>
          <span>
            List your property with PALTAS. We will value it, photograph it, and put it in
            front of buyers who are already looking.
          </span>
          <span className="choose-go">List my property →</span>
        </Link>
      </div>

      <p className="choose-foot">
        Renting instead? <Link href="/">Find a place to stay</Link>.
      </p>
    </main>
  );
}
