// Whether the passwordless "sign in as <role>" dev panel is available.
// Requiring an explicit ALLOW_DEV_LOGIN=true opt-in (on top of the
// service-role key the feature needs to function) means accidentally
// setting SUPABASE_SERVICE_ROLE_KEY in the production environment can
// no longer hand out administrator sessions to anyone who finds the
// login page. The VERCEL_ENV check is a second, independent latch:
// even with both variables set, the panel stays off in the production
// deployment (VERCEL_ENV distinguishes production/preview, unlike
// NODE_ENV which is "production" for preview builds too).
export function isDevLoginEnabled(): boolean {
  return (
    process.env.ALLOW_DEV_LOGIN === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}
