"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

import { changeAllocationMethod } from "./actions";

const basisValues = ["cota_parte", "by_area", "per_unit", "per_resident", "by_meter"] as const;
type Basis = (typeof basisValues)[number];

const schema = z.object({
  basis: z.enum(basisValues),
  isFixedTariff: z.boolean(),
  meterType: z.string().trim().optional(),
  rate: z.string().trim().optional(),
  approvalReference: z.string().trim().optional(),
});

function isBasis(value: string | undefined): value is Basis {
  return basisValues.includes(value as Basis);
}

export function ChangeMethodDialog({
  feeTypeId,
  currentMethod,
  currentConfig,
  currentApprovalReference,
}: {
  feeTypeId: string;
  currentMethod: string | null;
  // Reopening on an existing tariff_rate rule needs its config to
  // pre-fill basis/rate/meterType correctly -- currentMethod alone
  // can't distinguish "tariff per m²" from "tariff per apartment".
  currentConfig: { rate?: number; unit_of_measure?: string; meter_type?: string } | null;
  currentApprovalReference: string | null;
}) {
  const t = useTranslations("financeSetup");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isCurrentlyFixedTariff = currentMethod === "tariff_rate";
  const defaultBasis: Basis = isCurrentlyFixedTariff
    ? isBasis(currentConfig?.unit_of_measure)
      ? currentConfig!.unit_of_measure as Basis
      : "per_unit"
    : isBasis(currentMethod ?? undefined)
      ? (currentMethod as Basis)
      : "cota_parte";

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      basis: defaultBasis,
      isFixedTariff: isCurrentlyFixedTariff,
      meterType: currentConfig?.meter_type ?? "",
      rate: currentConfig?.rate !== undefined ? String(currentConfig.rate) : "",
      approvalReference: currentApprovalReference ?? "",
    },
  });

  const basis = useWatch({ control: form.control, name: "basis" });
  const isFixedTariff = useWatch({ control: form.control, name: "isFixedTariff" });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await changeAllocationMethod({
      feeTypeId,
      method: values.isFixedTariff ? "tariff_rate" : values.basis,
      meterType: values.basis === "by_meter" ? values.meterType : undefined,
      rate: values.isFixedTariff && values.rate ? Number(values.rate) : undefined,
      unitOfMeasure: values.isFixedTariff ? values.basis : undefined,
      approvalReference: values.approvalReference,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(t("updateError"));
      return;
    }

    toast.success(t("updateSuccess"));
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t("changeMethod")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("changeMethod")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="basis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("basisLabel")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cota_parte">{t("basisShare")}</SelectItem>
                      <SelectItem value="by_area">{t("basisArea")}</SelectItem>
                      <SelectItem value="per_unit">{t("basisPerUnit")}</SelectItem>
                      <SelectItem value="per_resident">{t("basisPerResident")}</SelectItem>
                      <SelectItem value="by_meter">{t("basisMeter")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {basis === "by_meter" && (
              <FormField
                control={form.control}
                name="meterType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("meterTypeLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("meterTypePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="isFixedTariff"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  </FormControl>
                  <div className="flex flex-col gap-1">
                    <FormLabel className="font-normal">{t("isFixedTariffLabel")}</FormLabel>
                    <p className="text-xs text-muted-foreground">{t("isFixedTariffHint")}</p>
                  </div>
                </FormItem>
              )}
            />
            {isFixedTariff && (
              <FormField
                control={form.control}
                name="rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("rateLabel")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder={t("ratePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="approvalReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("approvalReferenceLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("approvalReferencePlaceholder")} {...field} />
                  </FormControl>
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
