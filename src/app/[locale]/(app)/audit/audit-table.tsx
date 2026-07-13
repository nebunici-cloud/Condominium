"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type AuditEntry = {
  id: string;
  actorLabel: string;
  action: string;
  entityType: string;
  createdAt: string;
  before: unknown;
  after: unknown;
};

const actionVariant: Record<string, "default" | "secondary" | "destructive"> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
};

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  const t = useTranslations("audit");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("all");

  const actions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.action))).sort(),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (action !== "all" && entry.action !== action) return false;
      if (!query) return true;
      return (
        entry.actorLabel.toLowerCase().includes(query) ||
        entry.entityType.toLowerCase().includes(query)
      );
    });
  }, [entries, search, action]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterActionAll")}</SelectItem>
            {actions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("timestamp")}</TableHead>
                <TableHead>{t("actor")}</TableHead>
                <TableHead>{t("action")}</TableHead>
                <TableHead>{t("entityType")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{entry.actorLabel}</TableCell>
                  <TableCell>
                    <Badge variant={actionVariant[entry.action] ?? "outline"}>
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.entityType}</TableCell>
                  <TableCell>
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground">
                        {t("viewDetails")}
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("before")}
                          </p>
                          <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(entry.before, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("after")}
                          </p>
                          <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                            {JSON.stringify(entry.after, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
