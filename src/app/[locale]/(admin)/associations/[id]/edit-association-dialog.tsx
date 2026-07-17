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

import { updateAssociation } from "../actions";

const schema = z.object({
  name: z.string().trim().min(1),
  legalId: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export function EditAssociationDialog({
  associationId,
  defaultValues,
}: {
  associationId: string;
  defaultValues: { name: string; legalId: string; address: string };
}) {
  const t = useTranslations("associations");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await updateAssociation({ id: associationId, ...values });
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
          <DialogTitle>{t("editAssociation")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nameLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("namePlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="legalId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("legalIdLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("legalIdPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("addressLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("addressPlaceholder")} {...field} />
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
