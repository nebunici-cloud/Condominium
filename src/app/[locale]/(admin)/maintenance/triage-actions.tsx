"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { maintenancePriorityLabelKeys } from "@/lib/maintenance-status";
import { sanitizeFileName } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

import { updateMaintenanceRequest } from "./actions";

const MAX_RESOLUTION_PHOTOS = 5;

// Per-row triage controls. "Take into work" opens a planning dialog
// (priority + expected resolution date the resident will see);
// resolve/reject prompt for a resident-visible note; in-progress rows
// can re-plan without changing status.
export function TriageActions({
  requestId,
  status,
  priority,
  dueDate,
}: {
  requestId: string;
  status: string;
  priority: string;
  dueDate: string | null;
}) {
  const t = useTranslations("maintenance");
  const [busy, setBusy] = useState(false);
  const [noteDialog, setNoteDialog] = useState<null | "resolved" | "rejected">(null);
  const [note, setNote] = useState("");
  const [planDialog, setPlanDialog] = useState<null | "start" | "edit">(null);
  const [planPriority, setPlanPriority] = useState(priority);
  const [planDueDate, setPlanDueDate] = useState(dueDate ?? "");
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const [noteFileKey, setNoteFileKey] = useState(0);

  async function submit(input: {
    status: "open" | "in_progress" | "resolved" | "rejected";
    resolutionNote?: string;
    priority?: "low" | "normal" | "high" | "urgent";
    dueDate?: string | null;
    resolutionPhotoPaths?: string[];
  }) {
    setBusy(true);
    const result = await updateMaintenanceRequest({ id: requestId, ...input });
    setBusy(false);

    if (result.error) {
      toast.error(t("updateError"), { description: result.error });
      return;
    }
    toast.success(t("updateSuccess"));
    setNoteDialog(null);
    setPlanDialog(null);
    setNote("");
    setNoteFiles([]);
    setNoteFileKey((k) => k + 1);
  }

  // Resolve/reject: optionally upload "after" photos of the fixed
  // issue (staff hold the update right, so a direct upload into the
  // request's folder is authorized by the storage policy), then
  // transition. Rejection can carry photos too but usually won't.
  async function submitNote() {
    if (!noteDialog) return;
    let resolutionPhotoPaths: string[] | undefined;
    if (noteDialog === "resolved" && noteFiles.length > 0) {
      setBusy(true);
      const supabase = createClient();
      const uploaded: string[] = [];
      for (const file of noteFiles.slice(0, MAX_RESOLUTION_PHOTOS)) {
        const path = `${requestId}/resolution-${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
        const { error } = await supabase.storage.from("maintenance-photos").upload(path, file);
        if (!error) uploaded.push(path);
      }
      resolutionPhotoPaths = uploaded;
    }
    await submit({
      status: noteDialog,
      resolutionNote: note.trim() || undefined,
      resolutionPhotoPaths,
    });
  }

  function submitPlan() {
    submit({
      status: "in_progress",
      priority: planPriority as "low" | "normal" | "high" | "urgent",
      dueDate: planDueDate || null,
    });
  }

  const isTerminal = status === "resolved" || status === "rejected";

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {status === "open" && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setPlanDialog("start")}>
          {t("actionStart")}
        </Button>
      )}
      {status === "in_progress" && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPlanDialog("edit")}>
          {t("actionPlan")}
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
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => submit({ status: "open" })}>
          {t("actionReopen")}
        </Button>
      )}

      <Dialog open={planDialog !== null} onOpenChange={(open) => !open && setPlanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{planDialog === "start" ? t("actionStart") : t("actionPlan")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{t("priorityLabel")}</label>
              <Select value={planPriority} onValueChange={setPlanPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(maintenancePriorityLabelKeys).map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(maintenancePriorityLabelKeys[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor={`due-${requestId}`}>
                {t("dueDateLabel")}
              </label>
              <Input
                id={`due-${requestId}`}
                type="date"
                value={planDueDate}
                onChange={(event) => setPlanDueDate(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("dueDateHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={submitPlan}>
              {t("confirmTransition")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          {noteDialog === "resolved" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor={`resphoto-${requestId}`}>
                {t("resolutionPhotosLabel")}
              </label>
              <input
                key={noteFileKey}
                id={`resphoto-${requestId}`}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setNoteFiles(Array.from(event.target.files ?? []))}
                className="text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </div>
          )}
          <DialogFooter>
            <Button disabled={busy} onClick={submitNote}>
              {t("confirmTransition")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
