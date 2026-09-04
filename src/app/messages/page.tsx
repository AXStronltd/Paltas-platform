import { Inbox } from "@/components/messages/Inbox";

export const metadata = {
  title: "Messages — PALTAS",
  // Private correspondence. It has no business in a search index.
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return (
    <main className="container detail">
      <Inbox />
    </main>
  );
}
