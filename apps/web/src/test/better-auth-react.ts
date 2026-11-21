/** Shared, controllable stand-in for the Better Auth client (tests set resolved values per case). */
export const authMock = {
  signIn: { email: jest.fn(async () => ({ data: {}, error: null as { message?: string; code?: string } | null })) },
  signUp: { email: jest.fn(async () => ({ data: {}, error: null as { message?: string; code?: string } | null })) },
  signOut: jest.fn(async () => ({ data: {}, error: null })),
};
export const createAuthClient = () => authMock;
