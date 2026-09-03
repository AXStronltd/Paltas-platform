import { InfoPage } from "@/components/pages/InfoPage";

export const metadata = {
  title: "Help — PALTAS",
  description: "Getting help with a booking, reporting a problem, and how to reach us.",
};

export default function HelpPage() {
  return (
    <InfoPage
      titleKey="help.title"
      leadKey="help.lead"
      sections={[
        { id: "faq", paragraphs: 4 },
        { id: "cancellation", paragraphs: 3 },
        { id: "safety", paragraphs: 3 },
        { id: "contact", paragraphs: 2 },
      ]}
    />
  );
}
