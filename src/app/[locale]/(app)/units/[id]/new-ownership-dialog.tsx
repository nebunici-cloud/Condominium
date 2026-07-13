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

import { createOwnership, createOwnerAndOwnership } from "./actions";

const schema = z.object({
  ownerId: z.string().trim(),
  fullName: z.string().trim(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  sharePercent: z.string().trim().min(1),
});

export function NewOwnershipDialog({
  unitId,
  tenantId,
  owners,
}: {
  unitId: string;
  tenantId: string;
  owners: { id: string; full_name: string }[];
}) {
  const t = useTranslations("ownerships");
  const tOwners = useTranslations("owners");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { ownerId: "", fullName: "", email: "", phone: "", sharePercent: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    if (mode === "existing" && !values.ownerId) {
      form.setError("ownerId", { message: tCommon("required") });
      return;
    }
    if (mode === "new" && !values.fullName) {
      form.setError("fullName", { message: tCommon("required") });
      return;
    }

    setSubmitting(true);
    const result =
      mode === "existing"
        ? await createOwnership({
            unitId,
            tenantId,
            ownerId: values.ownerId,
            sharePercent: Number(values.sharePercent),
          })
        : await createOwnerAndOwnership({
            unitId,
            tenantId,
            fullName: values.fullName,
            email: values.email,
            phone: values.phone,
            sharePercent: Number(values.sharePercent),
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          setMode("existing");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("newOwnership")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newOwnership")}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "existing" ? "secondary" : "outline"}
            onClick={() => setMode("existing")}
          >
            {t("selectExisting")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "new" ? "secondary" : "outline"}
            onClick={() => setMode("new")}
          >
            {t("createNewOwner")}
          </Button>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {mode === "existing" ? (
              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("ownerLabel")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("ownerPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {owners.map((owner) => (
                          <SelectItem key={owner.id} value={owner.id}>
                            {owner.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tOwners("fullNameLabel")}</FormLabel>
                      <FormControl>
                        <Input placeholder={tOwners("fullNamePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tOwners("emailLabel")}</FormLabel>
                      <FormControl>
                        <Input placeholder={tOwners("emailPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tOwners("phoneLabel")}</FormLabel>
                      <FormControl>
                        <Input placeholder={tOwners("phonePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            <FormField
              control={form.control}
              name="sharePercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sharePercentLabel")}</FormLabel>
                  <FormControl>
                    <Input placeholder="50" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {t("sharePercentHint")}
                  </p>
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
