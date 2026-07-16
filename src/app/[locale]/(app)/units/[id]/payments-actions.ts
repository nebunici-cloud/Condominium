"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// Invoice paid/partially_paid status is kept in sync by a database
// trigger on payments (sync_invoice_status) -- no application-side
// recompute needed, and other write paths (imports, future payment
// webhooks) get the same behavior for free.

const recordPaymentSchema = z.object({
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  amount: z.number().positive(),
  paidAt: z.iso.date(),
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

  revalidatePath("/", "layout");
  return { error: null };
}
