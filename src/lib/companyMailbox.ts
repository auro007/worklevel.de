import nodemailer from "nodemailer";
export const mailboxHosts: Record<string, string> = {
  gmx: "mail.gmx.net", "gmx-com": "mail.gmx.com", webde: "smtp.web.de", gmail: "smtp.gmail.com", yahoo: "smtp.mail.yahoo.com",
};
export function mailboxTransport(provider: string, email: string, password: string) {
  const host = Object.prototype.hasOwnProperty.call(mailboxHosts, provider) ? mailboxHosts[provider] : null;
  if (!host) throw new Error("Dieser E-Mail-Anbieter wird noch nicht unterstützt.");
  return nodemailer.createTransport({ host, port: 465, secure: true,
    auth: { user: email, pass: password }, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true,
  });
}
