import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton breadcrumbLevels={2} rows={6} bare />;
}
