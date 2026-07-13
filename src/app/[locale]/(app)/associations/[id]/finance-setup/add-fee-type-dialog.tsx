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
  method: z.enum(["cota_parte", "by_area", "per_unit", "per_resident", "by_meter"]),
  meterType: z.string().trim().optional(),
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
    defaultValues: { key: "", label: "", method: "cota_parte", meterType: "" },
  });

  const method = useWatch({ control: form.control, name: "method" });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await createFeeType({ tenantId, associationId, ...values });
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
                {tCommon("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
