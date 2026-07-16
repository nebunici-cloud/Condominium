import * as Sentry from "@sentry/nextjs";

// Server/edge error monitoring, gated on NEXT_PUBLIC_SENTRY_DSN. With
// the DSN unset (local dev, CI, any environment that hasn't opted in)
// every Sentry call is an inert no-op, so behavior is unchanged until
// the variable is configured. A Sentry DSN is public by design, hence
// the NEXT_PUBLIC_ prefix -- it identifies a project's ingest
// endpoint, it is not a secret.
//
// We deliberately do NOT wrap next.config with withSentryConfig: that
// plugin's only added value here is source-map upload and release
// tagging, and it injects a bundler plugin that risks conflicting with
// this project's customized Next.js + Turbopack build. Error capture
// works fine through the native instrumentation hooks below; readable
// (un-minified) production stack traces via source maps can be added
// later if wanted.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development";

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment,
      // Sample 10% of transactions for performance tracing -- enough
      // signal without burning quota. Tune per plan.
      tracesSampleRate: 0.1,
    });
  }
}

// Next.js calls this for every server-side error (App Router). It's a
// no-op when Sentry was never initialized (no DSN).
export const onRequestError = Sentry.captureRequestError;
