// A stand-in for `@/server/functions` in page and component tests: every server
// function is a `vi.fn`, so a test says what the server answers and checks what was
// sent, without Start, cookies or a database. Use it with
//   vi.mock("@/server/functions", () => import("../../test/server-functions"));
import { vi } from "vitest";

export const getSession = vi.fn();
export const rememberMe = vi.fn();
export const setLang = vi.fn();
export const login = vi.fn();
export const logout = vi.fn();
export const getPickList = vi.fn();
export const getOpenMatch = vi.fn();
export const getVenues = vi.fn();
export const getBalls = vi.fn();
export const passBalls = vi.fn();
export const addGuest = vi.fn();
export const getMatchday = vi.fn();
export const getMatchdays = vi.fn();
export const announce = vi.fn();
export const quickCreate = vi.fn();
export const editMatch = vi.fn();
export const cancelMatch = vi.fn();
export const signUp = vi.fn();
export const withdraw = vi.fn();
export const makeTeams = vi.fn();
export const rebalance = vi.fn();
export const vote = vi.fn();
export const lock = vi.fn();
export const unlock = vi.fn();
export const setResult = vi.fn();
export const getCoords = vi.fn();
export const getNowcast = vi.fn();
export const getFullRoster = vi.fn();
export const savePlayer = vi.fn();
export const saveVenue = vi.fn();
export const getLog = vi.fn();
export const getRules = vi.fn();
export const addRule = vi.fn();
export const removeRule = vi.fn();
