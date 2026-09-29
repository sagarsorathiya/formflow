import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError } from "@/lib/authz";
import { enforceRateLimit } from "@/lib/rate-limit";
import { describeSmtpError } from "@/lib/connection-errors";
import nodemailer from "nodemailer";

const schema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  from: z.string().min(1),
  to: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    await enforceRateLimit({ key: `ratelimit:test-smtp:${user.id}`, limit: 10, windowSeconds: 5 * 60 });
    const body = schema.parse(await req.json());

    const transport = nodemailer.createTransport({
      host: body.host,
      port: body.port,
      secure: false,
      tls: { rejectUnauthorized: false },
    });

    try {
      await transport.sendMail({
        from: body.from,
        to: body.to,
        subject: "FormFlow SMTP Test",
        text: "This is a test message from FormFlow. Your SMTP configuration is working correctly.",
      });
    } catch (smtpErr) {
      // Same reasoning as test-ldap: a relay failure is the test's answer.
      console.error("[test-smtp] connection test failed:", smtpErr);
      return NextResponse.json(
        { ok: false, error: { code: "SMTP_TEST_FAILED", message: describeSmtpError(smtpErr) } },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, message: "Test email sent successfully." });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
