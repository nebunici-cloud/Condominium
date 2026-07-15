"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { PencilIcon } from "lucide-react";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { setLineAdjustment } from "../actions";

const schema = z.object({
  adjustmentAmount: z.string().trim(),
  adjustmentReason: z.string().trim().optional(),
});

export function AdjustmentDialog({
  invoiceLineId,
  currentAmount,
  currentReason,
}: {
  invoiceLineId: string;
  currentAmount: number;
  currentReason: string | null;
}) {
  const t = useTranslations("invoices");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      adjustmentAmount: currentAmount ? String(currentAmount) : "",
      adjustmentReason: currentReason ?? "",
    },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await setLineAdjustment({
      invoiceLineId,
      adjustmentAmount: values.adjustmentAmount ? Number(values.adjustmentAmount) : 0,
      adjustmentReason: values.adjustmentReason,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(t("adjustmentError"));
      return;
    }

    toast.success(t("adjustmentSuccess"));
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={t("editAdjustment")}>
              <PencilIcon />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("editAdjustment")}</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editAdjustment")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="adjustmentAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("adjustmentAmountLabel")}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adjustmentReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("adjustmentReasonLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("adjustmentReasonPlaceholder")} {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{t("adjustmentReasonHint")}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
