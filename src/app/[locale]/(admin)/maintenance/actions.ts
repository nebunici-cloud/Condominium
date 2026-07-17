"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "rejected"]),
  resolutionNote: z.string().trim().max(4000).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  // Expected resolution date, shown to the resident as an estimate.
  // null clears it; undefined leaves it untouched.
  dueDate: z.iso.date().nullable().optional(),
});

// Triage transition. Authorization is the maintenance_requests_update
// RLS policy (maintenance.request.manage per association). Terminal
// states stamp who closed the request and when; reopening clears them.
export async function updateMaintenanceRequest(input: z.infer<typeof updateSchema>) {
  const parsed = updateSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const isTerminal = parsed.status === "resolved" || parsed.status === "rejected";

  const { error } = await supabase
    .from("maintenance_requests")
    .update({
      status: parsed.status,
      resolution_note: parsed.resolutionNote || null,
      resolved_at: isTerminal ? new Date().toISOString() : null,
      resolved_by: isTerminal ? user.id : null,
      ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
      ...(parsed.dueDate !== undefined ? { due_date: parsed.dueDate } : {}),
    })
    .eq("id", parsed.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
