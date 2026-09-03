import { InfoPage } from "@/components/pages/InfoPage";

export const metadata = {
  title: "About PALTAS",
  description: "What PALTAS is, how it works, and what it promises about money and trust.",
};

export default function AboutPage() {
  return (
    <InfoPage
      titleKey="about.title"
      leadKey="about.lead"
      sections={[
        { id: "how", paragraphs: 3 },
        { id: "pricing", paragraphs: 3 },
        { id: "trust", paragraphs: 3 },
        { id: "verification", paragraphs: 2 },
        { id: "languages", paragraphs: 2 },
      ]}
    />
  );
}
