import { InvoiceDetailView } from "@/components/invoice-detail-view";

// Resident-facing route for the same branded invoice the admin module
// shows -- read-only, RLS-scoped to the caller's own units.
export default async function MyInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  return <InvoiceDetailView invoiceId={invoiceId} variant="portal" />;
}
