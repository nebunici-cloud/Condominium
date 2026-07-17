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

import { submitMyMeterReading } from "./actions";

type UnitMeter = { type: string; meterId: string };
type LastReading = { value: number; date: string };

const schema = z.object({
  meterKey: z.string().trim().min(1),
  readingValue: z.string().trim().min(1),
  readingDate: z.string().trim().min(1),
});

export function SubmitReadingDialog({
  unitId,
  tenantId,
  meters,
  lastReadingByKey,
}: {
  unitId: string;
  tenantId: string;
  meters: UnitMeter[];
  lastReadingByKey: Record<string, LastReading>;
}) {
  const t = useTranslations("meterReadings");
  const tMy = useTranslations("my");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const defaultValues = {
    meterKey: meters.length === 1 ? `${meters[0].type}::${meters[0].meterId}` : "",
    readingValue: "",
    readingDate: new Date().toISOString().slice(0, 10),
  };

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const meterKey = useWatch({ control: form.control, name: "meterKey" });
  const lastReading = meterKey ? lastReadingByKey[meterKey] : undefined;

  async function onSubmit(values: z.infer<typeof schema>) {
    const [type, meterId] = values.meterKey.split("::");
    setSubmitting(true);
    const result = await submitMyMeterReading({
      unitId,
      tenantId,
      meterType: type,
      meterId: meterId || undefined,
      readingValue: Number(values.readingValue),
      readingDate: values.readingDate,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(t("createError"));
      return;
    }

    toast.success(t("createSuccess"));
    form.reset(defaultValues);
    setOpen(false);
  }

  if (meters.length === 0) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(defaultValues);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {tMy("submitReading")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tMy("submitReading")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="meterKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("meterLabel")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("meterPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {meters.map((meter) => {
                        const key = `${meter.type}::${meter.meterId}`;
                        return (
                          <SelectItem key={key} value={key}>
                            {meter.type} ({meter.meterId})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {lastReading && (
              <p className="text-xs text-muted-foreground">
                {t("lastReadingHint", { value: lastReading.value, date: lastReading.date })}
              </p>
            )}
            <FormField
              control={form.control}
              name="readingValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("readingValueLabel")}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.001" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="readingDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("readingDateLabel")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {tMy("submitReadingConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
