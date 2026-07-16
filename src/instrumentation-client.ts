import * as Sentry from "@sentry/nextjs";

// Browser error monitoring. Same env gate as the server side: without
// NEXT_PUBLIC_SENTRY_DSN this init never runs, so the Sentry client
// stays uninitialized and every capture is a no-op.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Session Replay is off by default -- it captures user sessions
    // (and needs PII scrubbing consideration), so leave it opt-in.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Enables Sentry to tie navigations to the right transaction in the
// App Router. No-op when uninitialized.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
