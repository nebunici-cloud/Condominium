import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import { NewAssociationDialog } from "./new-association-dialog";

export default async function AssociationsPage() {
  const t = await getTranslations("associations");
  const tCommon = await getTranslations("common");
  const tBuildings = await getTranslations("buildings");
  const supabase = await createClient();

  const { data: associations } = await supabase
    .from("associations")
    .select("id, name, legal_id, address, created_at, buildings(count)")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <NewAssociationDialog />
      </div>

      {!associations || associations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAssociations")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nameLabel")}</TableHead>
              <TableHead>{t("legalIdLabel")}</TableHead>
              <TableHead>{tBuildings("title")}</TableHead>
              <TableHead>{tCommon("createdAt")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {associations.map((association) => (
              <TableRow key={association.id}>
                <TableCell className="font-medium">{association.name}</TableCell>
                <TableCell>{association.legal_id ?? "—"}</TableCell>
                <TableCell>
                  {t("buildingsCount", {
                    count: association.buildings?.[0]?.count ?? 0,
                  })}
                </TableCell>
                <TableCell>
                  {new Date(association.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/associations/${association.id}`}>
                      {t("viewDetails")}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
