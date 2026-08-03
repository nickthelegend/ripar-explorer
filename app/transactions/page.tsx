import type { Metadata } from "next";
import { Suspense } from "react";
import { TransactionsView } from "./transactions-view";
import { Panel, TableSkeleton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Transactions",
  description:
    "Settled x402 payments on Algorand: escrow funding, agent payouts net of protocol fee, and refunded budget — each row linking out to allo.info.",
  alternates: { canonical: "/transactions" },
};

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
          <div className="skel mb-6 h-7 w-48" />
          <Panel>
            <TableSkeleton rows={10} cols={6} />
          </Panel>
        </div>
      }
    >
      <TransactionsView />
    </Suspense>
  );
}
