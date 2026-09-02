import { Hero } from "@/components/marketplace/Hero";
import { PromoCarousel } from "@/components/marketplace/PromoCarousel";
import { MarketPanel } from "@/components/i18n/LocaleSwitcher";
import { Marketplace } from "@/components/marketplace/Marketplace";
import { DiscoveryRows } from "@/components/marketplace/DiscoveryRows";
import { TrustBand, TravelInspiration, BookEarlyBanner, BusinessCTA } from "@/components/marketplace/PromoSections";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <div className="container-wide">
        {/* Meets the visitor with a question about the trip they already have in
            mind, before the generic listing grid. */}
        <PromoCarousel />

        <div className="results-bar">
          <span>📍 Showing stays across Kenya</span>
          <span className="results-change">Change region</span>
        </div>
        <Marketplace />

        {/* 13 smart discovery rows — endless horizontal carousels */}
        <DiscoveryRows />

        {/* What a local knows and a visitor does not. */}
        <MarketPanel />

        <TrustBand />
        <TravelInspiration />
        <BookEarlyBanner />
        <BusinessCTA />
      </div>
    </main>
  );
}
