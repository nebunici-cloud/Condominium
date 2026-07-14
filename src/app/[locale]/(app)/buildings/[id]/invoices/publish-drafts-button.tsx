"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { publishDraftInvoices } from "./actions";

export function PublishDraftsButton({ invoiceIds }: { invoiceIds: string[] }) {
  const t = useTranslations("invoices");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const result = await publishDraftInvoices(invoiceIds);
    setSubmitting(false);

    if (result.error) {
      toast.error(t("publishError"));
      return;
    }

    toast.success(t("publishAllSuccess", { count: result.published }));
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("publishAllDrafts", { count: invoiceIds.length })}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("publishAllDrafts", { count: invoiceIds.length })}</DialogTitle>
          <DialogDescription>
            {t("publishAllDraftsConfirm", { count: invoiceIds.length })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button disabled={submitting} onClick={handleConfirm}>
            {tCommon("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
