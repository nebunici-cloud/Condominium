"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { updateTenant } from "./actions";

const schema = z.object({
  name: z.string().trim().min(1),
});

export function SettingsForm({
  tenantId,
  defaultValues,
}: {
  tenantId: string;
  defaultValues: { name: string };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true);
    const result = await updateTenant({ id: tenantId, ...values });
    setSubmitting(false);

    if (result.error) {
      toast.error(t("updateError"));
      return;
    }

    toast.success(t("updateSuccess"));
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nameLabel")}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={submitting} className="w-fit">
          {tCommon("save")}
        </Button>
      </form>
    </Form>
  );
}
