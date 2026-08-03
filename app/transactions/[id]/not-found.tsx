import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="No such transaction"
      body="Nothing on this network settled under that id. It may belong to the other network, or the id may be mistyped."
      action={
        <Link href="/transactions" className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[13px] font-medium">
          Back to transactions
        </Link>
      }
    />
  );
}
