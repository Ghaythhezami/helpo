export const createAuthClient = () => ({
  signIn: { email: async () => ({ data: {}, error: null }) },
  signUp: { email: async () => ({ data: {}, error: null }) },
  signOut: async () => ({ data: {}, error: null }),
});
