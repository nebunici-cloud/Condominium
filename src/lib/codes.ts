// Invoice numbers stay a strict per-tenant sequence (see
// publish_invoices) -- the numeric part never changes, this only
// controls how it's displayed: prefixed with the issuing
// association's short code for readability, e.g. "001-000047".
// Falls back to the bare padded number if the association's code
// isn't available for some reason, and to null for a draft (no
// number assigned yet).
export function formatInvoiceNumber(
  associationCode: string | null | undefined,
  invoiceNumber: number | null | undefined
): string | null {
  if (invoiceNumber === null || invoiceNumber === undefined) return null;
  const padded = String(invoiceNumber).padStart(6, "0");
  return associationCode ? `${associationCode}-${padded}` : padded;
}
