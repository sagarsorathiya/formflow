import nodemailer from "nodemailer";
import { getRuntimeConfig } from "./runtime-config";

// Cached transport, keyed by the host/port it was built for. SMTP settings are
// admin-editable at runtime, so the transport must be rebuilt when they change
// rather than cached forever on first use.
let _transport: { key: string; transport: nodemailer.Transporter } | null = null;

function getTransport(host: string, port: number): nodemailer.Transporter {
  const key = `${host}:${port}`;
  if (_transport && _transport.key === key) return _transport.transport;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: false, // plain SMTP on internal relay
    auth: undefined, // no auth on internal relay
    tls: { rejectUnauthorized: false }, // internal cert may be self-signed
  });
  _transport = { key, transport };
  return transport;
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const config = await getRuntimeConfig();
  const transport = getTransport(config.smtpHost, config.smtpPort);
  await transport.sendMail({
    from: config.smtpFrom,
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
