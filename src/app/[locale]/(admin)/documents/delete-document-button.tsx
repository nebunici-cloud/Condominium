"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteDocument } from "./actions";

export function DeleteDocumentButton({ id }: { id: string }) {
  const t = useTranslations("documents");
  const tCommon = useTranslations("common");
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setSubmitting(true);
    const result = await deleteDocument(id);
    setSubmitting(false);

    if (result.error) {
      toast.error(tCommon("error"), { description: result.error });
      return;
    }
    toast.success(t("deleteSuccess"));
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      disabled={submitting}
      aria-label={tCommon("delete")}
    >
      <Trash2Icon className="size-4" />
    </Button>
  );
}
