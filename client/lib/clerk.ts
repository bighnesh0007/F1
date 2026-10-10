// Clerk is enabled when its publishable key is set (inlined at build time). Without
// it the app runs with sign-in switched off.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
