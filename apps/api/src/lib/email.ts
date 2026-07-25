import type { Bindings } from '../env'

interface SendCodeResult {
  developmentCode?: string
}

export const sendLoginCode = async (
  env: Bindings,
  email: string,
  code: string,
): Promise<SendCodeResult> => {
  if (env.ENVIRONMENT === 'development' && !env.RESEND_API_KEY) {
    return { developmentCode: code }
  }

  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required outside local development')
  }

  const response = await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({
      from: env.MAIL_FROM,
      html: `<p>Your Observatory verification code is:</p><p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em">${code}</p><p>It expires in 10 minutes.</p>`,
      subject: `${code} is your Observatory code`,
      text: `Your Observatory verification code is ${code}. It expires in 10 minutes.`,
      to: [email],
    }),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`)
  }

  return {}
}
