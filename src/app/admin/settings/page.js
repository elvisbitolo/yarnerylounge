import RequireOwner from "@/components/RequireOwner";
import ClientPage from "./ClientPage";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <RequireOwner what="site settings">
      <ClientPage />
    </RequireOwner>
  );
}
