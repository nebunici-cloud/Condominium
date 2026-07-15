"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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

import { createFeeType } from "./actions";

const schema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  method: z.enum(["cota_parte", "by_area", "per_unit", "per_resident", "by_meter", "tariff_rate"]),
  meterType: z.string().trim().optional(),
  rate: z.string().trim().optional(),
  unitOfMeasure: z.enum(["cota_parte", "by_area", "per_unit", "per_resident", "by_meter"]).optional(),
  approvalReference: z.string().trim().optional(),
});

export function AddFeeTypeDialog({
  tenantId,
  associationId,
}: {
  tenantId: string;
  associationId: string;
}) {
  const t = useTranslations("financeSetup");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      key: "",
      label: "",
      method: "cota_parte",
      meterType: "",
      rate: "",
      unitOfMeasure: "per_unit",
      approvalReference: "",
    },
  });

  const method = useWatch({ control: form.control, name: "method" });
  const unitOfMeasure = useWatch({ control: form.control, name: "unitOfMeasure" });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await createFeeType({
      tenantId,
      associationId,
      key: values.key,
      label: values.label,
      method: values.method,
      meterType: values.meterType,
      rate: values.rate ? Number(values.rate) : undefined,
      unitOfMeasure: values.method === "tariff_rate" ? values.unitOfMeasure : undefined,
      approvalReference: values.approvalReference,
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
        <Button variant="outline">
          <PlusIcon />
          {t("addCustom")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addCustom")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("keyLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("keyPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("labelLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("labelPlaceholder")} {...field} />
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cota_parte">{t("methodCotaParte")}</SelectItem>
                      <SelectItem value="by_area">{t("methodByArea")}</SelectItem>
                      <SelectItem value="per_unit">{t("methodPerUnit")}</SelectItem>
                      <SelectItem value="per_resident">{t("methodPerResident")}</SelectItem>
                      <SelectItem value="by_meter">{t("methodByMeter")}</SelectItem>
                      <SelectItem value="tariff_rate">{t("methodTariffRate")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {method === "tariff_rate" && (
              <>
                <p className="text-xs text-muted-foreground">{t("tariffRateHint")}</p>
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
                <FormField
                  control={form.control}
                  name="unitOfMeasure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("unitOfMeasureLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="by_area">{t("unitOfMeasureArea")}</SelectItem>
                          <SelectItem value="per_unit">{t("unitOfMeasurePerUnit")}</SelectItem>
                          <SelectItem value="per_resident">{t("unitOfMeasureResident")}</SelectItem>
                          <SelectItem value="cota_parte">{t("unitOfMeasureShare")}</SelectItem>
                          <SelectItem value="by_meter">{t("unitOfMeasureMeter")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            {(method === "by_meter" || (method === "tariff_rate" && unitOfMeasure === "by_meter")) && (
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
                {tCommon("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
