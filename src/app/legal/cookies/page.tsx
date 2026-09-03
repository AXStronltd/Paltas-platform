import { InfoPage } from "@/components/pages/InfoPage";

export const metadata = {
  title: "Cookies — PALTAS",
  description: "Which cookies PALTAS sets, what each is for, and how to control them.",
};

export default function CookiesPage() {
  return (
    <InfoPage
      titleKey="cookies.title"
      leadKey="cookies.lead"
      updatedKey="legal.updated"
      sections={[
        { id: "cookies.what", paragraphs: 2 },
        { id: "cookies.which", paragraphs: 3 },
        { id: "cookies.control", paragraphs: 2 },
      ]}
    />
  );
}
