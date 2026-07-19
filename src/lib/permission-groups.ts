// Groups the association-scoped capabilities for display in the
// per-association role permissions editor. Kept as a plain ordered
// list (not derived from the DB at render time) so the grouping and
// row order stay stable and match the translation keys in
// src/messages/{ro,ru}.json (permissions.group_<group> and
// permissions.<code_with_dots_as_underscores>).
export const ASSOCIATION_SCOPED_CAPABILITY_GROUPS: { group: string; codes: string[] }[] = [
  { group: "association", codes: ["core.association.view", "core.association.update", "core.association.delete"] },
  { group: "building", codes: ["core.building.create", "core.building.view", "core.building.update", "core.building.delete"] },
  { group: "unit", codes: ["core.unit.create", "core.unit.view", "core.unit.update", "core.unit.delete"] },
  { group: "ownership", codes: ["core.ownership.create", "core.ownership.view", "core.ownership.update"] },
  { group: "occupancy", codes: ["core.occupancy.create", "core.occupancy.view", "core.occupancy.update"] },
  { group: "config", codes: ["core.config.manage"] },
  { group: "feeType", codes: ["finance.fee_type.create", "finance.fee_type.view", "finance.fee_type.update"] },
  { group: "allocationRule", codes: ["finance.allocation_rule.manage"] },
  { group: "invoice", codes: ["finance.invoice.generate", "finance.invoice.publish", "finance.invoice.view", "finance.invoice.cancel"] },
  { group: "payment", codes: ["finance.payment.record", "finance.payment.view"] },
  { group: "openingBalance", codes: ["finance.opening_balance.import"] },
  { group: "meterReading", codes: ["finance.meter_reading.record", "finance.meter_reading.view"] },
  { group: "comms", codes: ["comms.announcement.manage"] },
  { group: "maintenance", codes: ["maintenance.request.manage"] },
  { group: "documents", codes: ["docs.document.manage"] },
];

// Organization-wide capabilities (is_association_scoped = false):
// granted once per role for the whole tenant, edited in the org-wide
// matrix on the permissions landing page.
export const TENANT_WIDE_CAPABILITY_GROUPS: { group: string; codes: string[] }[] = [
  { group: "organization", codes: ["core.tenant.manage", "core.role.manage", "core.user.invite", "core.association.create"] },
  { group: "ownersDirectory", codes: ["core.owner.view", "core.owner.create", "core.owner.update", "core.owner.delete"] },
  { group: "occupantsDirectory", codes: ["core.occupant.view", "core.occupant.create", "core.occupant.update"] },
  { group: "audit", codes: ["core.audit.view"] },
];

export function capabilityLabelKey(code: string): string {
  return code.replace(/\./g, "_");
}
