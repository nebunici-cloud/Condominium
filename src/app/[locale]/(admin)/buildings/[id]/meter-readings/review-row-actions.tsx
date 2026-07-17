"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { reviewMeterReading, deleteMeterReading } from "./review-actions";

export function ReviewRowActions({ id }: { id: string }) {
  const t = useTranslations("meterReadings");
  const tCommon = useTranslations("common");
  const [busy, setBusy] = useState(false);

  async function handleReview() {
    setBusy(true);
    const result = await reviewMeterReading(id);
    setBusy(false);
    if (result.error) {
      toast.error(tCommon("error"), { description: result.error });
      return;
    }
    toast.success(t("reviewMarked"));
  }

  async function handleDelete() {
    if (!window.confirm(t("reviewDeleteConfirm"))) return;
    setBusy(true);
    const result = await deleteMeterReading(id);
    setBusy(false);
    if (result.error) {
      toast.error(tCommon("error"), { description: result.error });
      return;
    }
    toast.success(t("reviewDeleted"));
  }

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={handleReview}
        disabled={busy}
        aria-label={t("reviewAccept")}
        title={t("reviewAccept")}
      >
        <CheckIcon className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        disabled={busy}
        aria-label={tCommon("delete")}
        title={tCommon("delete")}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}
