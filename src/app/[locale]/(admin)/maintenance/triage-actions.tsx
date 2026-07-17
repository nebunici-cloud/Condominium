"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { updateMaintenanceRequest } from "./actions";

// Per-row triage controls: take into work, resolve (with a note the
// resident will see), or reject (with a note). Resolve/reject prompt
// for the note in a small dialog.
export function TriageActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const t = useTranslations("maintenance");
  const [busy, setBusy] = useState(false);
  const [noteDialog, setNoteDialog] = useState<null | "resolved" | "rejected">(null);
  const [note, setNote] = useState("");

  async function transition(next: "open" | "in_progress" | "resolved" | "rejected", resolutionNote?: string) {
    setBusy(true);
    const result = await updateMaintenanceRequest({
      id: requestId,
      status: next,
      resolutionNote,
    });
    setBusy(false);

    if (result.error) {
      toast.error(t("updateError"), { description: result.error });
      return;
    }
    toast.success(t("updateSuccess"));
    setNoteDialog(null);
    setNote("");
  }

  const isTerminal = status === "resolved" || status === "rejected";

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {status === "open" && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => transition("in_progress")}>
          {t("actionStart")}
        </Button>
      )}
      {!isTerminal && (
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setNoteDialog("resolved")}>
            {t("actionResolve")}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setNoteDialog("rejected")}>
            {t("actionReject")}
          </Button>
        </>
      )}
      {isTerminal && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => transition("open")}>
          {t("actionReopen")}
        </Button>
      )}

      <Dialog open={noteDialog !== null} onOpenChange={(open) => !open && setNoteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {noteDialog === "resolved" ? t("actionResolve") : t("actionReject")}
            </DialogTitle>
          </DialogHeader>
          <label className="text-sm font-medium" htmlFor={`note-${requestId}`}>
            {t("resolutionLabel")}
          </label>
          <textarea
            id={`note-${requestId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
            placeholder={t("resolutionPlaceholder")}
          />
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => noteDialog && transition(noteDialog, note.trim() || undefined)}
            >
              {t("confirmTransition")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
