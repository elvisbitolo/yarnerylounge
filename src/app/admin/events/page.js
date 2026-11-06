import Link from "next/link";
import EventManager from "@/components/admin/EventManager";

export default function AdminEventsPage() {
  return (
    <>
      <div style={{ maxWidth: 1100, margin: "18px auto 0", padding: "0 20px" }}>
        <Link href="/admin/events/submissions" style={{ color: "#d70a70", fontWeight: 800, textDecoration: "none" }}>
          Review member event proposals →
        </Link>
      </div>
      <EventManager />
    </>
  );
}
