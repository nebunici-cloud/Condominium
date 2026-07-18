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
import { maintenanceCategories, maintenanceCategoryLabelKeys } from "@/lib/maintenance-status";
import { sanitizeFileName } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

import { createMaintenanceRequest, attachRequestPhotos } from "./actions";

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type Option = { id: string; label: string };

const schema = z.object({
  visibility: z.enum(["private", "public"]),
  unitId: z.string().min(1),
  category: z.enum(["plumbing", "electrical", "heating", "elevator", "common_area", "other"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000),
});

// Shared file-a-request dialog. Every request is anchored to a unit; the
// visibility toggle decides whether it's private (reporter + staff) or
// public (visible to the building's residents). Residents get their own
// units; staff get the units they manage.
export function NewRequestDialog({
  tenantId,
  units,
}: {
  tenantId: string;
  units: Option[];
}) {
  const t = useTranslations("maintenance");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);

  const defaultValues = {
    visibility: "private" as "private" | "public",
    unitId: units.length === 1 ? units[0].id : "",
    category: "other" as const,
    title: "",
    description: "",
  };

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setFileError(null);
    if (!values.unitId) {
      form.setError("unitId", { message: t("unitRequired") });
      return;
    }
    if (files.length > MAX_PHOTOS) {
      setFileError(t("photoTooMany", { max: MAX_PHOTOS }));
      return;
    }
    if (files.some((file) => file.size > MAX_PHOTO_BYTES)) {
      setFileError(t("photoTooLarge"));
      return;
    }

    setSubmitting(true);
    const result = await createMaintenanceRequest({
      tenantId,
      unitId: values.unitId,
      visibility: values.visibility,
      category: values.category,
      title: values.title,
      description: values.description || undefined,
    });

    if (result.error || !result.requestId) {
      setSubmitting(false);
      toast.error(t("createError"), { description: result.error ?? undefined });
      return;
    }

    if (files.length > 0) {
      const supabase = createClient();
      const uploaded: string[] = [];
      for (const file of files) {
        const path = `${result.requestId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("maintenance-photos")
          .upload(path, file);
        if (!uploadError) uploaded.push(path);
      }
      if (uploaded.length > 0) {
        await attachRequestPhotos({ requestId: result.requestId, paths: uploaded });
      }
      if (uploaded.length < files.length) {
        toast.warning(t("photoUploadPartial"));
      }
    }

    setSubmitting(false);
    toast.success(t("createSuccess"));
    form.reset(defaultValues);
    setFiles([]);
    setFileInputKey((key) => key + 1);
    setOpen(false);
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
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("visibilityLabel")}</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={field.value === "private" ? "default" : "outline"}
                      onClick={() => field.onChange("private")}
                    >
                      {t("visibilityPrivate")}
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === "public" ? "default" : "outline"}
                      onClick={() => field.onChange("public")}
                    >
                      {t("visibilityPublic")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {field.value === "public" ? t("visibilityPublicHint") : t("visibilityPrivateHint")}
                  </p>
                </FormItem>
              )}
            />

            {units.length > 1 && (
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("unitLabel")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("unitPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("categoryLabel")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {maintenanceCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {t(maintenanceCategoryLabelKeys[category])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("titleLabel")}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t("titlePlaceholder")} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("descriptionLabel")}</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      rows={5}
                      className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="request-photos">
                {t("photosLabel")}
              </label>
              <input
                key={fileInputKey}
                id="request-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              <p className="text-xs text-muted-foreground">{t("photosHint", { max: MAX_PHOTOS })}</p>
              {fileError && <p className="text-sm text-destructive">{fileError}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {t("submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
