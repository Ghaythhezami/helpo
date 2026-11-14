import { configureStore } from "@reduxjs/toolkit";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

type User = { id: string; name: string; email: string };
type Session = { user: User; session: { id: string } } | null;
type Credentials = { email: string; password: string };

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/auth`,
    credentials: "include",
  }),
  tagTypes: ["Session"],
  endpoints: (builder) => ({
    session: builder.query<Session, void>({
      query: () => "/get-session",
      providesTags: ["Session"],
    }),
    signIn: builder.mutation<unknown, Credentials>({
      query: (body) => ({ url: "/sign-in/email", method: "POST", body }),
      invalidatesTags: ["Session"],
    }),
    signUp: builder.mutation<unknown, Credentials & { name: string }>({
      query: (body) => ({ url: "/sign-up/email", method: "POST", body }),
      invalidatesTags: ["Session"],
    }),
    signOut: builder.mutation<unknown, void>({
      query: () => ({ url: "/sign-out", method: "POST" }),
      invalidatesTags: ["Session"],
    }),
  }),
});

export const { useSessionQuery, useSignInMutation, useSignUpMutation, useSignOutMutation } = authApi;
export const store = configureStore({
  reducer: { [authApi.reducerPath]: authApi.reducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(authApi.middleware),
});
