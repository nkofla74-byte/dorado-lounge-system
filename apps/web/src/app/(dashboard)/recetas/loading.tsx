import { TableSkeleton } from '@/components/ui/table-skeleton';

export default function Loading() {
  return (
    <div className="p-6">
      <TableSkeleton />
    </div>
  );
}
