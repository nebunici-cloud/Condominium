"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function recomputeInvoiceStatus(supabase: SupabaseClient, invoiceId: string) {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("total_amount")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return;

  const { data: payments } = await supabase
    .from("payments")
    .select("amount")
    .eq("matched_invoice_id", invoiceId);
  const paid = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);

  const status = paid <= 0 ? "issued" : paid < invoice.total_amount ? "partially_paid" : "paid";

  await supabase.from("invoices").update({ status }).eq("id", invoiceId);
}

const recordPaymentSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  amount: z.number().positive(),
  paidAt: z.string(),
  method: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  matchedInvoiceId: z.string().uuid().optional(),
});

export async function recordPayment(input: z.infer<typeof recordPaymentSchema>) {
  const parsed = recordPaymentSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("payments").insert({
    tenant_id: parsed.tenantId,
    unit_id: parsed.unitId,
    amount: parsed.amount,
    paid_at: parsed.paidAt,
    method: parsed.method || null,
    reference: parsed.reference || null,
    matched_invoice_id: parsed.matchedInvoiceId || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  if (parsed.matchedInvoiceId) {
    await recomputeInvoiceStatus(supabase, parsed.matchedInvoiceId);
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const matchPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export async function matchPayment(input: z.infer<typeof matchPaymentSchema>) {
  const parsed = matchPaymentSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("payments")
    .update({ matched_invoice_id: parsed.invoiceId })
    .eq("id", parsed.paymentId);

  if (error) {
    return { error: error.message };
  }

  await recomputeInvoiceStatus(supabase, parsed.invoiceId);

  revalidatePath("/", "layout");
  return { error: null };
}
