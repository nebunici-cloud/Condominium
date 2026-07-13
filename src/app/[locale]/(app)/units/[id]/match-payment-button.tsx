"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { matchPayment } from "./payments-actions";

type OutstandingInvoice = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
};

export function MatchPaymentButton({
  paymentId,
  outstandingInvoices,
}: {
  paymentId: string;
  outstandingInvoices: OutstandingInvoice[];
}) {
  const t = useTranslations("payments");
  const [invoiceId, setInvoiceId] = useState("");
  const [pending, setPending] = useState(false);

  if (outstandingInvoices.length === 0) {
    return <span className="text-xs text-muted-foreground">{t("unmatched")}</span>;
  }

  async function handleMatch() {
    if (!invoiceId) return;
    setPending(true);
    const result = await matchPayment({ paymentId, invoiceId });
    setPending(false);

    if (result.error) {
      toast.error(t("matchError"));
      return;
    }

    toast.success(t("matchSuccess"));
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={invoiceId} onValueChange={setInvoiceId}>
        <SelectTrigger size="sm" className="w-48">
          <SelectValue placeholder={t("matchInvoicePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {outstandingInvoices.map((invoice) => (
            <SelectItem key={invoice.id} value={invoice.id}>
              {invoice.billing_period_start} – {invoice.billing_period_end} (
              {invoice.total_amount})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!invoiceId || pending} onClick={handleMatch}>
        {t("matchButton")}
      </Button>
    </div>
  );
}
