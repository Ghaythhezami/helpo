"use client";
import { createAuthClient } from "better-auth/react";

/** Same-origin Better Auth client: /api/auth/* is rewritten to the API, so cookies stay first-party. */
export const authClient = createAuthClient();
