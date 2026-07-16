// Transactional email, env-gated: without RESEND_API_KEY + EMAIL_FROM
// every send is a silent no-op, so the app behaves identically in
// environments with no email configured (local dev, preview) and
// lights up the moment the two variables are set. Failures never
// bubble into the calling action -- an invite or a published invoice
// must not fail because a notification could not be delivered.

type EmailInput = {
  to: string;
  subject: string;
  html: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: EmailInput): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    return { sent: false };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      console.error("sendEmail failed", response.status, await response.text());
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    console.error("sendEmail failed", error);
    return { sent: false };
  }
}

// Absolute URL for links inside emails. APP_BASE_URL is optional; when
// it's unset, callers should omit the link rather than break the send.
export function appUrl(path: string): string | null {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : null;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Templates are deliberately bilingual (RO first, RU below) -- at
// invite time we don't yet know the recipient's preferred language.
export function inviteEmail(tenantName: string): { subject: string; html: string } {
  const name = htmlEscape(tenantName);
  const link = appUrl("/ro/login");
  const linkHtml = link
    ? `<p><a href="${link}">${link}</a></p>`
    : "";
  return {
    subject: `Invitație — ${tenantName} / Приглашение — ${tenantName}`,
    html: `
      <p>Bună ziua,</p>
      <p>Ați fost invitat(ă) pe platforma asociației <strong>${name}</strong>.
      Conectați-vă cu această adresă de email pentru a vă activa contul —
      veți primi un link de conectare, fără parolă.</p>
      ${linkHtml}
      <hr />
      <p>Здравствуйте!</p>
      <p>Вас пригласили на платформу ассоциации <strong>${name}</strong>.
      Войдите, используя этот адрес электронной почты, чтобы активировать
      аккаунт — вы получите ссылку для входа, без пароля.</p>
      ${linkHtml}
    `,
  };
}

export function invoicePublishedEmail(params: {
  unitNumber: string;
  periodLabel: string;
  totalAmount: number;
}): { subject: string; html: string } {
  const unit = htmlEscape(params.unitNumber);
  const period = htmlEscape(params.periodLabel);
  const amount = params.totalAmount.toFixed(2);
  const link = appUrl("/ro/my");
  const linkHtml = link ? `<p><a href="${link}">${link}</a></p>` : "";
  return {
    subject: `Factură nouă — ap. ${params.unitNumber}, ${params.periodLabel} / Новый счёт`,
    html: `
      <p>Bună ziua,</p>
      <p>Factura pentru apartamentul <strong>${unit}</strong>, perioada
      <strong>${period}</strong>, este disponibilă. Total de plată:
      <strong>${amount} lei</strong>.</p>
      ${linkHtml}
      <hr />
      <p>Здравствуйте!</p>
      <p>Счёт за квартиру <strong>${unit}</strong> за период
      <strong>${period}</strong> доступен. Сумма к оплате:
      <strong>${amount} лей</strong>.</p>
      ${linkHtml}
    `,
  };
}
