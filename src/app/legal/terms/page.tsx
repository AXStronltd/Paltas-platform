import { InfoPage } from "@/components/pages/InfoPage";

export const metadata = {
  title: "Terms — PALTAS",
  description: "The terms on which PALTAS may be used, by guests and by hosts.",
};

export default function TermsPage() {
  return (
    <InfoPage
      titleKey="terms.title"
      leadKey="terms.lead"
      updatedKey="legal.updated"
      sections={[
        { id: "terms.using", paragraphs: 2 },
        { id: "terms.booking", paragraphs: 3 },
        { id: "terms.hosting", paragraphs: 3 },
        { id: "terms.liability", paragraphs: 2 },
      ]}
    />
  );
}
