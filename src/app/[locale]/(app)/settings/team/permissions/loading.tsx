import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton breadcrumbLevels={0} rows={4} bare />;
}
