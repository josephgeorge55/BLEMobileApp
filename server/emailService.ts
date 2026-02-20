import { Resend } from "resend";
import { randomBytes } from "node:crypto";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    },
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error("Resend not connected");
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email,
  };
}

async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

export function generateWarrantyRegistrationNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(5);
  let random = "";
  for (let i = 0; i < 5; i++) {
    random += chars[bytes[i] % chars.length];
  }
  return `BLD-WR-${year}${month}-${random}`;
}

interface WarrantyEmailParams {
  recipientEmail: string;
  firstName: string;
  lastName: string;
  serialNumber: string;
  registrationNumber: string;
  purchaseDate: string;
  dealerName?: string;
  warrantyStartDate: string;
  warrantyExpirationDate: string;
  country: string;
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

function buildWarrantyEmailHtml(params: WarrantyEmailParams): string {
  const {
    firstName,
    lastName,
    serialNumber,
    registrationNumber,
    purchaseDate,
    dealerName,
    warrantyStartDate,
    warrantyExpirationDate,
    country,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Warranty Registration Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Header -->
<tr>
<td style="background-color:#1A2332;padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">BLADE OUTBOARDS</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:1px;text-transform:uppercase;">Warranty Registration</p>
</td>
</tr>

<!-- Success Banner -->
<tr>
<td style="background-color:#34C759;padding:16px 40px;text-align:center;">
<p style="margin:0;color:#ffffff;font-size:15px;font-weight:600;">&#10003; Registration Confirmed</p>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:32px 40px;">
<p style="margin:0 0 16px;color:#1A2332;font-size:16px;line-height:1.5;">Dear ${firstName} ${lastName},</p>
<p style="margin:0 0 24px;color:#4a5568;font-size:15px;line-height:1.6;">Thank you for registering your Blade Outboard motor. Your warranty has been successfully activated. Please keep this email for your records.</p>

<!-- Registration Number Box -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
<tr>
<td style="border:2px solid #34C759;border-radius:8px;padding:20px;text-align:center;background-color:#f0fdf4;">
<p style="margin:0 0 4px;color:#4a5568;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Registration Number</p>
<p style="margin:0;color:#1A2332;font-size:22px;font-weight:700;letter-spacing:1px;">${registrationNumber}</p>
</td>
</tr>
</table>

<!-- Details Table -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
<tr>
<td style="background-color:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
<p style="margin:0;color:#1A2332;font-size:14px;font-weight:600;">Warranty Details</p>
</td>
</tr>
<tr>
<td style="padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:40%;">Serial Number</td>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1A2332;font-size:13px;font-weight:600;">${serialNumber}</td>
</tr>
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Purchase Date</td>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1A2332;font-size:13px;font-weight:600;">${formatDate(purchaseDate)}</td>
</tr>
${dealerName ? `<tr>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Dealer</td>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1A2332;font-size:13px;font-weight:600;">${dealerName}</td>
</tr>` : ""}
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Warranty Start</td>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1A2332;font-size:13px;font-weight:600;">${formatDate(warrantyStartDate)}</td>
</tr>
<tr>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Warranty Expiry</td>
<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;color:#1A2332;font-size:13px;font-weight:600;color:#34C759;">${formatDate(warrantyExpirationDate)}</td>
</tr>
<tr>
<td style="padding:12px 16px;color:#64748b;font-size:13px;">Country</td>
<td style="padding:12px 16px;color:#1A2332;font-size:13px;font-weight:600;">${country}</td>
</tr>
</table>
</td>
</tr>
</table>

<p style="margin:0 0 8px;color:#4a5568;font-size:14px;line-height:1.6;">If you have any questions about your warranty coverage, please contact your authorised Blade dealer or visit our support channels.</p>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#1A2332;padding:24px 40px;text-align:center;">
<p style="margin:0 0 8px;color:#ffffff;font-size:14px;font-weight:600;">Blade Marine Technologies Limited</p>
<p style="margin:0 0 16px;color:rgba(255,255,255,0.5);font-size:12px;line-height:1.5;">Please retain this email as proof of your warranty registration.</p>
<p style="margin:0;color:rgba(255,255,255,0.35);font-size:11px;">This is an automated email. Please do not reply directly to this message.</p>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

interface WelcomeEmailParams {
  recipientEmail: string;
}

function getLogoBase64(): string {
  try {
    const fs = require("fs");
    const path = require("path");
    const logoPath = path.join(process.cwd(), "attached_assets", "ICON_Only_Green_1771572436008.png");
    return fs.readFileSync(logoPath, { encoding: "base64" });
  } catch {
    return "";
  }
}

function buildWelcomeEmailHtml(params: WelcomeEmailParams): string {
  const logoB64 = getLogoBase64();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Welcome to Blade Outboards</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Header -->
<tr>
<td style="background-color:#1A2332;padding:40px 40px 32px;text-align:center;">
${logoB64 ? `<img src="data:image/png;base64,${logoB64}" alt="Blade Outboards" width="40" style="display:inline-block;width:40px;height:auto;margin:0 0 12px;" />` : ""}
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">BLADE OUTBOARDS</h1>
<p style="margin:12px 0 0;color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Electric Marine Propulsion</p>
</td>
</tr>

<!-- Welcome Banner -->
<tr>
<td style="background:linear-gradient(135deg,#34C759 0%,#30B350 100%);padding:20px 40px;text-align:center;">
<p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">Welcome to Blade Outboards</p>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:36px 40px 20px;">
<p style="margin:0 0 20px;color:#1A2332;font-size:16px;line-height:1.6;font-weight:500;">Thank you for creating your account.</p>
<p style="margin:0 0 28px;color:#4a5568;font-size:15px;line-height:1.7;">We are delighted to have you on board. Your Blade Outboards account gives you access to advanced motor monitoring, trip recording, anti-theft protection, and much more &mdash; all from the palm of your hand.</p>

<!-- Account Created Info -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
<tr>
<td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;padding-bottom:6px;">Account Created</td>
</tr>
<tr>
<td style="color:#1A2332;font-size:14px;font-weight:600;">${dateStr} at ${timeStr}</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Getting Started -->
<p style="margin:0 0 16px;color:#1A2332;font-size:15px;font-weight:700;">Get started with your Blade experience:</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
<tr>
<td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="36" valign="top" style="padding-right:14px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background-color:#34C759;color:#ffffff;font-size:13px;font-weight:700;width:28px;height:28px;text-align:center;line-height:28px;border-radius:14px;">1</td>
</tr></table>
</td>
<td valign="top">
<p style="margin:0 0 2px;color:#1A2332;font-size:14px;font-weight:600;">Explore the Blade Halo Connect App</p>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">Pair your motor, monitor real-time telemetry, and track your trips on the water.</p>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="36" valign="top" style="padding-right:14px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background-color:#34C759;color:#ffffff;font-size:13px;font-weight:700;width:28px;height:28px;text-align:center;line-height:28px;border-radius:14px;">2</td>
</tr></table>
</td>
<td valign="top">
<p style="margin:0 0 2px;color:#1A2332;font-size:14px;font-weight:600;">Register Your Warranty</p>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">Protect your investment by registering your motor warranty directly through the app.</p>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:14px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="36" valign="top" style="padding-right:14px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background-color:#34C759;color:#ffffff;font-size:13px;font-weight:700;width:28px;height:28px;text-align:center;line-height:28px;border-radius:14px;">3</td>
</tr></table>
</td>
<td valign="top">
<p style="margin:0 0 2px;color:#1A2332;font-size:14px;font-weight:600;">Enter Your Vessel Information</p>
<p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">Add your boat details to unlock your Digital Outboard Passport and personalised features.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>

<p style="margin:0 0 8px;color:#4a5568;font-size:14px;line-height:1.6;">We are committed to delivering the best electric marine experience. If you need assistance at any time, visit our <a href="https://support.bladeoutboards.com" style="color:#34C759;text-decoration:underline;font-weight:600;">Support Portal</a> or reach out to your authorised Blade dealer.</p>

<!-- Device Requirements -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;">
<tr>
<td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 20px;">
<p style="margin:0 0 4px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Optimal App Experience</p>
<p style="margin:0;color:#4a5568;font-size:12px;line-height:1.5;">iOS 16 or later &nbsp;&#8226;&nbsp; Android 10 (API 29) or later</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#1A2332;padding:28px 40px;text-align:center;">
<p style="margin:0 0 8px;color:#ffffff;font-size:14px;font-weight:600;">Blade Marine Technologies Limited</p>
<p style="margin:0 0 4px;color:rgba(255,255,255,0.5);font-size:12px;">bladeoutboards.ch</p>
<p style="margin:12px 0 0;color:rgba(255,255,255,0.4);font-size:11px;">Need help? Visit <a href="https://support.bladeoutboards.com" style="color:rgba(255,255,255,0.55);text-decoration:underline;">support.bladeoutboards.com</a></p>
<p style="margin:16px 0 0;color:rgba(255,255,255,0.35);font-size:11px;">This is an automated message from Blade Outboards. Please do not reply to this email.</p>
<p style="margin:12px 0 0;color:rgba(255,255,255,0.35);font-size:11px;"><a href="https://www.bladeoutboards.com/tandc" style="color:rgba(255,255,255,0.5);text-decoration:underline;">Terms &amp; Conditions</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="https://www.bladeoutboards.com/privacy-policy" style="color:rgba(255,255,255,0.5);text-decoration:underline;">Privacy Policy</a></p>
<p style="margin:12px 0 0;color:rgba(255,255,255,0.35);font-size:10px;line-height:1.5;">If you did not create this account, please contact <a href="mailto:IT@bladetcg.com" style="color:rgba(255,255,255,0.5);text-decoration:underline;">IT@bladetcg.com</a> immediately.</p>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function sendWelcomeEmail(
  params: WelcomeEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { recipientEmail } = params;

  try {
    console.log(`[Email] Sending welcome email to ${recipientEmail}`);

    const { client } = await getResendClient();

    const html = buildWelcomeEmailHtml(params);

    const { data, error } = await client.emails.send({
      from: "Blade Outboards <notifications@bladeoutboards.ch>",
      to: [recipientEmail],
      subject: "Welcome to Blade Outboards",
      html,
    });

    if (error) {
      console.error(`[Email] Resend API error for welcome email (${recipientEmail}):`, error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Welcome email sent successfully to ${recipientEmail} (id: ${data?.id})`);
    return { success: true };
  } catch (err: any) {
    console.error(`[Email] Failed to send welcome email to ${recipientEmail}:`, err);
    return { success: false, error: err.message || "Unknown email error" };
  }
}

export async function sendWarrantyConfirmationEmail(
  params: WarrantyEmailParams,
): Promise<{ success: boolean; error?: string; registrationNumber: string }> {
  const { registrationNumber, recipientEmail } = params;

  try {
    console.log(`[Email] Sending warranty confirmation to ${recipientEmail} for ${registrationNumber}`);

    const { client, fromEmail } = await getResendClient();
    const sender = fromEmail || "noreply@resend.dev";

    const html = buildWarrantyEmailHtml(params);

    const { data, error } = await client.emails.send({
      from: `Blade Outboards <${sender}>`,
      to: [recipientEmail],
      subject: `Warranty Registration Confirmed - ${registrationNumber}`,
      html,
    });

    if (error) {
      console.error(`[Email] Resend API error for ${registrationNumber}:`, error);
      return { success: false, error: error.message, registrationNumber };
    }

    console.log(`[Email] Warranty confirmation sent successfully: ${registrationNumber} (id: ${data?.id})`);
    return { success: true, registrationNumber };
  } catch (err: any) {
    console.error(`[Email] Failed to send warranty confirmation for ${registrationNumber}:`, err);
    return {
      success: false,
      error: err.message || "Unknown email error",
      registrationNumber,
    };
  }
}
