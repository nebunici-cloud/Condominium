"use client";

import { useRef, useState } from "react";
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
import { sanitizeFileName } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

import { createDocument } from "./actions";

type AssociationOption = { id: string; name: string };

const MAX_BYTES = 20 * 1024 * 1024;

export function UploadDocumentDialog({
  tenantId,
  associations,
}: {
  tenantId: string;
  associations: AssociationOption[];
}) {
  const t = useTranslations("documents");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [associationId, setAssociationId] = useState(
    associations.length === 1 ? associations[0].id : ""
  );
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"members" | "staff">("members");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setAssociationId(associations.length === 1 ? associations[0].id : "");
    setTitle("");
    setVisibility("members");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!associationId || !title.trim() || !file) {
      setError(t("uploadMissingFields"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("uploadTooLarge"));
      return;
    }

    setSubmitting(true);

    // Browser -> private bucket under the caller's own session; the
    // storage INSERT policy requires docs.document.manage for this
    // association's folder.
    const supabase = createClient();
    const path = `${associationId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);

    if (uploadError) {
      setSubmitting(false);
      toast.error(t("uploadError"), { description: uploadError.message });
      return;
    }

    const result = await createDocument({
      tenantId,
      associationId,
      title: title.trim(),
      fileName: file.name,
      storagePath: path,
      mimeType: file.type || undefined,
      sizeBytes: file.size,
      visibility,
    });
    setSubmitting(false);

    if (result.error) {
      toast.error(t("uploadError"), { description: result.error });
      return;
    }

    toast.success(t("uploadSuccess"));
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("upload")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("upload")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {associations.length > 1 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{t("associationLabel")}</label>
              <Select value={associationId} onValueChange={setAssociationId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("associationPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {associations.map((association) => (
                    <SelectItem key={association.id} value={association.id}>
                      {association.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="document-title">
              {t("titleLabel")}
            </label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("titlePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{t("visibilityLabel")}</label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as "members" | "staff")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="members">{t("visibilityMembers")}</SelectItem>
                <SelectItem value="staff">{t("visibilityStaff")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="document-file">
              {t("fileLabel")}
            </label>
            <input
              id="document-file"
              ref={fileInputRef}
              type="file"
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-muted-foreground">{t("fileHint")}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {t("uploadConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
