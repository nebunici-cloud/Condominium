import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton breadcrumbLevels={3} rows={4} />;
}
