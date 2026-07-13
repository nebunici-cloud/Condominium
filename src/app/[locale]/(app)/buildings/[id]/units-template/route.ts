import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> }
) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "units" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("title"));

  sheet.columns = [
    { header: t("unitNumberLabel"), key: "unit_number", width: 16 },
    { header: t("floorLabel"), key: "floor", width: 10 },
    { header: t("areaLabel"), key: "area_sqm", width: 14 },
    { header: t("shareLabel"), key: "ownership_share_percent", width: 16 },
    { header: t("metersLabel"), key: "meters", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    unit_number: "12",
    floor: 3,
    area_sqm: 54.5,
    ownership_share_percent: 2.35,
    meters: "cold_water:CW-001; electricity:EL-002",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="units-template.xlsx"',
    },
  });
}
