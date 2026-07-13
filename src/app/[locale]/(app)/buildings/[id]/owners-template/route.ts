import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> }
) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "owners" });
  const tOwnerships = await getTranslations({ locale, namespace: "ownerships" });
  const tUnits = await getTranslations({ locale, namespace: "units" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("title"));

  sheet.columns = [
    { header: t("fullNameLabel"), key: "full_name", width: 24 },
    { header: t("emailLabel"), key: "email", width: 24 },
    { header: t("phoneLabel"), key: "phone", width: 18 },
    { header: tUnits("unitNumberLabel"), key: "unit_number", width: 16 },
    { header: tOwnerships("sharePercentLabel"), key: "share_percent", width: 16 },
    { header: tOwnerships("effectiveFromLabel"), key: "effective_from", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    full_name: "Ion Popescu",
    email: "ion.popescu@example.com",
    phone: "+373 60 000 000",
    unit_number: "12",
    share_percent: 60,
    effective_from: "",
  });
  sheet.addRow({
    full_name: "Maria Ionescu",
    email: "maria.ionescu@example.com",
    phone: "",
    unit_number: "12",
    share_percent: 40,
    effective_from: "",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="owners-template.xlsx"',
    },
  });
}
