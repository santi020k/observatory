import type { Bindings } from '../env'

interface SendCodeResult {
  developmentCode?: string
}

interface FeedbackNotification {
  contactEmail: string | null
  description: string
  diagnosticReport: string | null
  id: string
  locale: string
  projectDisplayName: string
  projectSlug: string
  source: 'android' | 'ios' | 'website'
  title: string
  type: 'bug' | 'idea' | 'message'
}

interface EmailContent {
  html: string
  subject: string
  text: string
  to: string
}

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll('\'', '&#039;')

const sendEmail = async (
  env: Bindings,
  content: EmailContent
): Promise<void> => {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required outside local development')
  }

  const response = await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({
      from: env.MAIL_FROM,
      html: content.html,
      subject: content.subject,
      text: content.text,
      to: [content.to]
    }),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`)
  }
}

export const sendLoginCode = async (
  env: Bindings,
  email: string,
  code: string
): Promise<SendCodeResult> => {
  if (env.ENVIRONMENT === 'development' && !env.RESEND_API_KEY) {
    return { developmentCode: code }
  }

  await sendEmail(env, {
    html: [
      '<p>Your Observatory verification code is:</p>',
      `<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em">${code}</p>`,
      '<p>It expires in 10 minutes.</p>'
    ].join(''),
    subject: `${code} is your Observatory code`,
    text: `Your Observatory verification code is ${code}. It expires in 10 minutes.`,
    to: email
  })

  return {}
}

export const sendFeedbackNotification = async (
  env: Bindings,
  feedback: FeedbackNotification
): Promise<void> => {
  if (env.ENVIRONMENT === 'development' && !env.RESEND_API_KEY) return

  const boardUrl = new URL(
    `/projects/${feedback.projectSlug}/feedback/`,
    env.SITE_URL
  ).toString()

  const typeLabel = feedback.type === 'message' ?
    'support message' :
    feedback.type

  const contactEmail = feedback.contactEmail ?? 'Not provided'

  const diagnosticText = feedback.diagnosticReport ?
    `\n\nDiagnostics\n${feedback.diagnosticReport}` :
    ''

  const diagnosticHtml = feedback.diagnosticReport ?
    [
      '<h2>Diagnostics</h2>',
      `<pre style="white-space: pre-wrap">${escapeHtml(feedback.diagnosticReport)}</pre>`
    ].join('') :
    ''

  await sendEmail(env, {
    html: [
      `<p>New ${escapeHtml(typeLabel)} received for <strong>${escapeHtml(feedback.projectDisplayName)}</strong>.</p>`,
      `<h1>${escapeHtml(feedback.title)}</h1>`,
      `<p style="white-space: pre-wrap">${escapeHtml(feedback.description)}</p>`,
      '<h2>Submission details</h2>',
      '<ul>',
      `<li>Contact: ${escapeHtml(contactEmail)}</li>`,
      `<li>Source: ${escapeHtml(feedback.source)}</li>`,
      `<li>Locale: ${escapeHtml(feedback.locale)}</li>`,
      `<li>ID: ${escapeHtml(feedback.id)}</li>`,
      '</ul>',
      diagnosticHtml,
      `<p><a href="${escapeHtml(boardUrl)}">Open the feedback board</a></p>`
    ].join(''),
    subject: `New ${typeLabel} for ${feedback.projectDisplayName}`,
    text: [
      `New ${typeLabel} received for ${feedback.projectDisplayName}.`,
      '',
      feedback.title,
      feedback.description,
      '',
      `Contact: ${contactEmail}`,
      `Source: ${feedback.source}`,
      `Locale: ${feedback.locale}`,
      `ID: ${feedback.id}`,
      diagnosticText,
      '',
      `Open the feedback board: ${boardUrl}`
    ].join('\n'),
    to: env.OWNER_EMAIL
  })
}
