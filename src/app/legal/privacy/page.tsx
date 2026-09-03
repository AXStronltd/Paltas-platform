import { InfoPage } from "@/components/pages/InfoPage";

export const metadata = {
  title: "Privacy — PALTAS",
  description: "What PALTAS collects, why, who it is shared with, and what you can ask us to do with it.",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      titleKey="privacy.title"
      leadKey="privacy.lead"
      updatedKey="legal.updated"
      sections={[
        { id: "privacy.collect", paragraphs: 3 },
        { id: "privacy.use", paragraphs: 2 },
        { id: "privacy.share", paragraphs: 3 },
        { id: "privacy.rights", paragraphs: 2 },
      ]}
    />
  );
}
