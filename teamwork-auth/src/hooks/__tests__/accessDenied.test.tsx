import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useTeamworkAuth } from "../useTeamworkAuth";
import { Login } from "../../components/Login";
import { AuthContext } from "../../providers/AuthProvider";
import type { AuthContextType } from "../../types";

jest.mock("@teamwork/login-button", () => ({}), { virtual: true });
// `import.meta` cannot load under Jest's CommonJS transform; see utils/buildEnv.ts.
jest.mock("../../utils/buildEnv", () => ({ domainKeyFromBuildEnv: () => undefined }));

/**
 * The auth service refuses sign-in to people Maven's access rule does not let
 * into the app (e.g. a client collaborator, or someone whose access covers other
 * apps only). It answers 403 with `{ error, code, message }`, where `message` is
 * written for the person. The library used to throw that away ("Failed to log
 * in"), so a refused person just saw the login button again with no reason.
 */

const AUTH = "https://auth.test";
const REFUSAL = {
  error: "Access denied",
  code: "app_not_allowed",
  message: "Your Maven access doesn't include this app. Ask an admin if you need it.",
};

type Reply = { status: number; body: unknown };

/** Route fetch calls by path; anything unlisted is a 401 (no session). */
function mockFetch(routes: Record<string, Reply>) {
  const fetchMock = jest.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const reply = routes[path] ?? { status: 401, body: { error: "No session" } };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
      text: async () => JSON.stringify(reply.body),
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function setUrl(search: string) {
  window.location.search = search;
  window.location.href = `http://localhost:3000/${search}`;
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
  setUrl("");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useTeamworkAuth — refusal reason", () => {
  it("keeps the reason when the auth service refuses the login", async () => {
    setUrl("?code=abc");
    mockFetch({ "/auth/login": { status: 403, body: REFUSAL } });

    const { result } = renderHook(() => useTeamworkAuth({ authServiceUrl: AUTH }));

    await waitFor(() => expect(result.current.accessDenied).not.toBeNull());
    expect(result.current.accessDenied).toEqual({ code: REFUSAL.code, message: REFUSAL.message });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("rejects login() with the reason, not a generic message", async () => {
    mockFetch({ "/auth/login": { status: 403, body: REFUSAL } });
    const { result } = renderHook(() => useTeamworkAuth({ authServiceUrl: AUTH }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.login("fresh-code")).rejects.toThrow(REFUSAL.message);
    });
  });

  it("drops the used code from the URL after a refusal (it cannot be retried)", async () => {
    setUrl("?code=abc");
    mockFetch({ "/auth/login": { status: 403, body: REFUSAL } });
    const { result } = renderHook(() => useTeamworkAuth({ authServiceUrl: AUTH }));

    await waitFor(() => expect(result.current.accessDenied).not.toBeNull());
    expect(window.history.replaceState).toHaveBeenCalled();
  });

  it("keeps the reason when a returning session is refused at refresh", async () => {
    // The session cookie is valid but the person's access was removed: the
    // auth service re-checks the rule on refresh and answers 403.
    mockFetch({ "/auth/refresh": { status: 403, body: REFUSAL } });
    const { result } = renderHook(() => useTeamworkAuth({ authServiceUrl: AUTH }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessDenied).toEqual({ code: REFUSAL.code, message: REFUSAL.message });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("has no reason when there is simply no session (401)", async () => {
    mockFetch({});
    const { result } = renderHook(() => useTeamworkAuth({ authServiceUrl: AUTH }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessDenied).toBeNull();
  });

  it("ignores a 403 that carries no usable message", async () => {
    mockFetch({ "/auth/refresh": { status: 403, body: { error: "Forbidden" } } });
    const { result } = renderHook(() => useTeamworkAuth({ authServiceUrl: AUTH }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accessDenied).toEqual({ code: "access_denied", message: expect.any(String) });
  });

  it("clears the reason on logout", async () => {
    mockFetch({ "/auth/refresh": { status: 403, body: REFUSAL }, "/auth/logout": { status: 200, body: {} } });
    const { result } = renderHook(() => useTeamworkAuth({ authServiceUrl: AUTH }));
    await waitFor(() => expect(result.current.accessDenied).not.toBeNull());

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.accessDenied).toBeNull();
  });
});

describe("<Login> — refusal reason", () => {
  const withContext = (accessDenied: AuthContextType["accessDenied"]) =>
    render(
      <AuthContext.Provider
        value={{
          user: null,
          logout: async () => undefined,
          loading: false,
          isAuthenticated: false,
          getAccessToken: () => null,
          accessDenied,
        }}
      >
        <Login clientID="client" redirectURI="https://app.test" />
      </AuthContext.Provider>
    );

  it("shows the reason above the sign-in button", () => {
    withContext({ code: REFUSAL.code, message: REFUSAL.message });
    expect(screen.getByRole("alert").textContent).toBe(REFUSAL.message);
  });

  it("shows nothing extra when there is no refusal", () => {
    withContext(null);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still renders outside an AuthProvider", () => {
    render(<Login clientID="client" redirectURI="https://app.test" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
