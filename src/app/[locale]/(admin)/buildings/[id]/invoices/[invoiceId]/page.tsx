import { InvoiceDetailView } from "@/components/invoice-detail-view";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id, invoiceId } = await params;
  return <InvoiceDetailView invoiceId={invoiceId} expectedBuildingId={id} variant="admin" />;
}
