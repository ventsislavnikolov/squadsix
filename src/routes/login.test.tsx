// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION, answerSession, renderApp } from "../../test/render-app";
import { getFullRoster, getSession, login } from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const SIGN_IN = /sign in/iu;
const PLAYERS_AND_RATINGS = /players and ratings/iu;

describe("login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerSession();
  });

  it("needs both fields before it can be sent", async () => {
    const { user } = renderApp("/login");
    const submit = await screen.findByRole("button", { name: SIGN_IN });
    expect(submit).toHaveProperty("disabled", true);
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    expect(submit).toHaveProperty("disabled", true);
    await user.type(screen.getByLabelText("Password"), "secret");
    expect(submit).toHaveProperty("disabled", false);
  });

  it("signs the admin in and opens the admin pages", async () => {
    login.mockImplementation(() => {
      getSession.mockResolvedValue(ADMIN_SESSION);
      return Promise.resolve();
    });
    getFullRoster.mockResolvedValue([]);
    const { user, router } = renderApp("/login");
    await user.type(await screen.findByLabelText("Email"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: SIGN_IN }));
    expect(login).toHaveBeenCalledWith({
      data: { email: "a@example.com", password: "secret" },
    });
    expect(
      await screen.findByRole("heading", { name: PLAYERS_AND_RATINGS })
    ).toBeDefined();
    expect(router.state.location.pathname).toBe("/admin");
  });

  it("says when the credentials are wrong", async () => {
    login.mockRejectedValue(new Error("bad-login"));
    const { user } = renderApp("/login");
    await user.type(await screen.findByLabelText("Email"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: SIGN_IN }));
    await waitFor(() =>
      expect(screen.getByText("Wrong email or password.")).toBeDefined()
    );
  });
});
