"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches errors thrown while rendering the root layout / segments
// that a nested error boundary can't. Reports to Sentry (a no-op when
// no DSN is configured) and shows a minimal fallback. Kept plain and
// dependency-free on purpose -- it renders its own <html>/<body> and
// runs outside next-intl's provider, so it can't use translations.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#666", marginTop: "0.5rem" }}>
            A apărut o eroare. Reîncărcați pagina. / Произошла ошибка. Обновите страницу.
          </p>
        </div>
      </body>
    </html>
  );
}
