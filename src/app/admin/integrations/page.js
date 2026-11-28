import RequireOwner from "@/components/RequireOwner";
import IntegrationsAdmin from "./IntegrationsAdmin";

export const dynamic = "force-dynamic";

export default function AdminIntegrationsPage() {
  return (
    <RequireOwner what="community integrations">
      <IntegrationsAdmin />
    </RequireOwner>
  );
}
