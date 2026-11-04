// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderComponent } from "../../test/render-component";
import { ConfirmButton } from "./confirm-button";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const LOCK = { name: "Lock teams" };

function renderButton(onConfirm: () => void, disabled = false) {
  return renderComponent(
    <ConfirmButton
      confirmLabel="Lock"
      description="Voting stops."
      disabled={disabled}
      onConfirm={onConfirm}
      title="Lock the teams?"
    >
      Lock teams
    </ConfirmButton>
  );
}

describe("ConfirmButton", () => {
  it("asks first, then acts on yes and closes", async () => {
    const onConfirm = vi.fn();
    const { user } = renderButton(onConfirm);
    await user.click(await screen.findByRole("button", LOCK));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Lock the teams?");
    expect(dialog.textContent).toContain("Voting stops.");
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Lock" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does nothing when the answer is cancel", async () => {
    const onConfirm = vi.fn();
    const { user } = renderButton(onConfirm);
    await user.click(await screen.findByRole("button", LOCK));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cannot be opened while disabled", async () => {
    renderButton(vi.fn(), true);
    expect(
      (await screen.findByRole("button", LOCK)).hasAttribute("disabled")
    ).toBe(true);
  });
});
