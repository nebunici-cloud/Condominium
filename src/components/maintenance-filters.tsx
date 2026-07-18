"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  maintenanceCategories,
  maintenanceCategoryLabelKeys,
  maintenanceStatusLabelKeys,
  maintenancePriorityLabelKeys,
} from "@/lib/maintenance-status";

const ALL = "all";

// Back-office triage filters. State lives in the URL query string, so
// the server component re-renders the filtered list and links stay
// shareable. Selecting "all" drops the param.
export function MaintenanceFilters({
  buildings,
}: {
  buildings: { id: string; label: string }[];
}) {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = {
    status: searchParams.get("status") ?? ALL,
    category: searchParams.get("category") ?? ALL,
    priority: searchParams.get("priority") ?? ALL,
    building: searchParams.get("building") ?? ALL,
  };
  const hasFilters = Object.values(current).some((value) => value !== ALL);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={current.status} onValueChange={(value) => setParam("status", value)}>
        <SelectTrigger size="sm" className="w-auto min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
          {Object.keys(maintenanceStatusLabelKeys).map((value) => (
            <SelectItem key={value} value={value}>
              {t(maintenanceStatusLabelKeys[value])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={current.category} onValueChange={(value) => setParam("category", value)}>
        <SelectTrigger size="sm" className="w-auto min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
          {maintenanceCategories.map((value) => (
            <SelectItem key={value} value={value}>
              {t(maintenanceCategoryLabelKeys[value])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={current.priority} onValueChange={(value) => setParam("priority", value)}>
        <SelectTrigger size="sm" className="w-auto min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allPriorities")}</SelectItem>
          {Object.keys(maintenancePriorityLabelKeys).map((value) => (
            <SelectItem key={value} value={value}>
              {t(maintenancePriorityLabelKeys[value])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {buildings.length > 1 && (
        <Select value={current.building} onValueChange={(value) => setParam("building", value)}>
          <SelectTrigger size="sm" className="w-auto min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allBuildings")}</SelectItem>
            {buildings.map((building) => (
              <SelectItem key={building.id} value={building.id}>
                {building.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <XIcon className="size-4" />
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}
