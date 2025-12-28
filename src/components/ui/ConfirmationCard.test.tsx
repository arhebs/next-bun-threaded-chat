import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ConfirmationCard } from "@/components/ui/ConfirmationCard";

describe("ConfirmationCard", () => {
  it("renders approve/decline actions when pending", () => {
    const html = renderToStaticMarkup(
      <ConfirmationCard
        title="Delete this thread"
        description="Confirm deletion"
        payload={{ threadId: "t1" }}
        status="pending"
        onApprove={() => {}}
        onReject={() => {}}
      />
    );

    expect(html).toContain("Delete this thread");
    expect(html).toContain("Approve");
    expect(html).toContain("Decline");
    expect(html).toContain("threadId");
    expect(html).toContain("t1");
  });

  it("hides actions once approved", () => {
    const html = renderToStaticMarkup(
      <ConfirmationCard title="Update cell" status="approved" />
    );

    expect(html).toContain("Approved");
    expect(html).not.toContain("Decline");
  });
});
