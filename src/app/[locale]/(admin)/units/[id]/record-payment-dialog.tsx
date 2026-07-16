"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { recordPayment } from "./payments-actions";

type OutstandingInvoice = {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
};

const schema = z.object({
  amount: z.string().trim().min(1),
  paidAt: z.string().trim().min(1),
  method: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  matchedInvoiceId: z.string().optional(),
});

export function RecordPaymentDialog({
  unitId,
  tenantId,
  outstandingInvoices,
}: {
  unitId: string;
  tenantId: string;
  outstandingInvoices: OutstandingInvoice[];
}) {
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: "",
      paidAt: new Date().toISOString().slice(0, 10),
      method: "",
      reference: "",
      matchedInvoiceId: "",
    },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await recordPayment({
      unitId,
      tenantId,
      amount: Number(values.amount),
      paidAt: values.paidAt,
      method: values.method,
      reference: values.reference,
      matchedInvoiceId: values.matchedInvoiceId || undefined,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(t("createError"));
      return;
    }

    toast.success(t("createSuccess"));
    form.reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("newPayment")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newPayment")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("amountLabel")}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paidAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("paidAtLabel")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("methodLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("methodPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("referenceLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("referencePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {outstandingInvoices.length > 0 && (
              <FormField
                control={form.control}
                name="matchedInvoiceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("matchInvoiceLabel")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("matchInvoicePlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {outstandingInvoices.map((invoice) => (
                          <SelectItem key={invoice.id} value={invoice.id}>
                            {invoice.billing_period_start} – {invoice.billing_period_end} (
                            {invoice.total_amount})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {tCommon("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
