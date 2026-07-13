"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
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

import { changeAllocationMethod } from "./actions";

const schema = z.object({
  method: z.enum(["cota_parte", "by_area", "per_unit", "per_resident", "by_meter"]),
  meterType: z.string().trim().optional(),
});

export function ChangeMethodDialog({
  feeTypeId,
  currentMethod,
}: {
  feeTypeId: string;
  currentMethod: string | null;
}) {
  const t = useTranslations("financeSetup");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: (currentMethod as z.infer<typeof schema>["method"]) ?? "cota_parte",
      meterType: "",
    },
  });

  const method = useWatch({ control: form.control, name: "method" });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await changeAllocationMethod({ feeTypeId, ...values });
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
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {method === "by_meter" && (
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
