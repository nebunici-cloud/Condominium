"use client";

import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { updateUnit } from "../../buildings/[id]/actions";

const schema = z.object({
  unitNumber: z.string().trim().min(1),
  floor: z.string().trim().optional(),
  areaSqm: z.string().trim().optional(),
  ownershipSharePercent: z.string().trim().optional(),
  residentCount: z.string().trim().optional(),
  meters: z.array(z.object({ type: z.string(), meterId: z.string() })),
});

type FormValues = z.infer<typeof schema>;

export function EditUnitDialog({
  unitId,
  defaultValues,
}: {
  unitId: string;
  defaultValues: FormValues;
}) {
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const meterFields = useFieldArray({ control: form.control, name: "meters" });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const result = await updateUnit({
      id: unitId,
      unitNumber: values.unitNumber,
      floor: values.floor ? Number(values.floor) : undefined,
      areaSqm: values.areaSqm ? Number(values.areaSqm) : undefined,
      ownershipSharePercent: values.ownershipSharePercent
        ? Number(values.ownershipSharePercent)
        : undefined,
      residentCount: values.residentCount ? Number(values.residentCount) : undefined,
      meters: values.meters.filter((m) => m.type && m.meterId),
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaultValues);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editUnit")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="unitNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("unitNumberLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("unitNumberPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="floor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("floorLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("floorPlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="areaSqm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("areaLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("areaPlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ownershipSharePercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("shareLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("sharePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="residentCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("residentCountLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("residentCountPlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("metersLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("metersHint")}</p>
              {meterFields.fields.map((meterField, index) => (
                <div key={meterField.id} className="flex items-center gap-2">
                  <Input
                    placeholder={t("meterType")}
                    {...form.register(`meters.${index}.type` as const)}
                  />
                  <Input
                    placeholder={t("meterId")}
                    {...form.register(`meters.${index}.meterId` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => meterFields.remove(index)}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => meterFields.append({ type: "", meterId: "" })}
              >
                <PlusIcon />
                {t("addMeter")}
              </Button>
            </div>

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
