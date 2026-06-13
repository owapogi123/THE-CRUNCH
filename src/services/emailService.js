const { Resend } = require("resend");
const db = require("../config/db");

function getEmailProvider() {
  return String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
}

function shouldUseConsoleEmailFallback() {
  return (
    getEmailProvider() === "console" ||
    String(process.env.NODE_ENV || "").trim().toLowerCase() === "development"
  );
}

function logDevelopmentOtpEmail({
  flow,
  to,
  code,
  customerName,
}) {
  console.log(
    [
      "[EMAIL DEV FALLBACK]",
      `Flow: ${flow}`,
      `To: ${to}`,
      `Customer: ${customerName || "Customer"}`,
      `OTP: ${code}`,
    ].join("\n"),
  );
}

function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
}

function getSender() {
  const from = String(process.env.EMAIL_FROM || "").trim();
  if (!from) {
    throw new Error("EMAIL_FROM is not configured");
  }
  return from;
}

async function loadRestaurantSettings() {
  try {
    const [rows] = await db.query(
      `SELECT settings_json
         FROM system_settings
        WHERE setting_key = 'restaurant_settings'
        LIMIT 1`,
    );

    if (!rows.length || !rows[0].settings_json) {
      return {
        restaurantName: "The Crunch",
        tagline: "",
        email: "",
        phone: "",
        address: "",
        currency: "PHP",
      };
    }

    const parsed = JSON.parse(rows[0].settings_json);
    const readString = (value, fallback = "") => {
      const normalized = String(value ?? "").trim();
      return normalized || fallback;
    };

    return {
      restaurantName: readString(parsed?.restaurantName, "The Crunch"),
      tagline: readString(parsed?.tagline),
      email: readString(parsed?.email),
      phone: readString(parsed?.phone),
      address: readString(parsed?.address),
      currency: readString(parsed?.currency, "PHP"),
    };
  } catch {
    return {
      restaurantName: "The Crunch",
      tagline: "",
      email: "",
      phone: "",
      address: "",
      currency: "PHP",
    };
  }
}

async function sendVerificationEmail({
  to,
  code,
  customerName,
}) {
  const recipient = String(to || "").trim();
  const safeName = String(customerName || "Customer").trim() || "Customer";
  const verificationCode = String(code || "").trim();

  if (!recipient) {
    throw new Error("Verification email recipient is required");
  }

  if (!verificationCode) {
    throw new Error("Verification code is required");
  }

  if (shouldUseConsoleEmailFallback()) {
    logDevelopmentOtpEmail({
      flow: "registration_verification",
      to: recipient,
      code: verificationCode,
      customerName: safeName,
    });
    return {
      id: "console-dev-verification",
      provider: "console",
      to: recipient,
    };
  }

  const resend = getResendClient();
  const from = getSender();
  const result = await resend.emails.send({
    from,
    to: recipient,
    subject: "Verify your email - The Crunch",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f7f3ee; padding: 24px; color: #23150c;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #eadfce;">
          <p style="margin: 0 0 12px; font-size: 14px; color: #8a6d3b; text-transform: uppercase; letter-spacing: 0.12em;">The Crunch</p>
          <h1 style="margin: 0 0 16px; font-size: 24px; color: #23150c;">Verify your email</h1>
          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7;">Hi ${safeName},</p>
          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7;">
            Thanks for registering with The Crunch. Use the verification code below to confirm your email address.
          </p>
          <div style="margin: 24px 0; padding: 18px; text-align: center; background: #fff8e1; border: 1px solid #f2d48a; border-radius: 14px;">
            <div style="font-size: 30px; font-weight: 700; letter-spacing: 0.3em; color: #5a3712;">${verificationCode}</div>
          </div>
          <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.7;">This code expires in 10 minutes.</p>
          <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #6b7280;">
            If you did not create this account, you can safely ignore this email.
          </p>
        </div>
      </div>
    `,
    text: `Hi ${safeName}, your The Crunch verification code is ${verificationCode}. This code expires in 10 minutes.`,
  });

  if (result?.error) {
    const resendError = new Error(
      typeof result.error === "string"
        ? result.error
        : result.error?.message || "Unknown Resend error",
    );
    resendError.name = result.error?.name || "ResendVerificationError";
    resendError.statusCode = result.error?.statusCode;
    resendError.response = result.error?.response || result;
    resendError.cause = result.error?.cause;
    resendError.resendError = result.error;
    throw resendError;
  }

  return result;
}

async function sendCustomerOrderReceiptEmail({
  to,
  customerName,
  order,
}) {
  const resend = getResendClient();
  const from = getSender();
  const recipient = String(to || "").trim();
  const safeName = String(customerName || "Customer").trim() || "Customer";
  const orderNumber = String(order?.orderNumber || "").trim();
  const orderType = String(order?.orderType || "").trim();
  const paymentMethod = String(order?.paymentMethod || "").trim();
  const paymentStatus = String(order?.paymentStatus || "").trim();
  const note = String(order?.note || "").trim();
  const restaurantSettings = await loadRestaurantSettings();
  const restaurantName = restaurantSettings.restaurantName;
  const currency = restaurantSettings.currency;
  const subtotalAmount = Number(order?.subtotal || 0);
  const taxAmount = Number(order?.taxAmount || 0);
  const serviceChargeAmount = Number(order?.serviceChargeAmount || 0);
  const total = Number(order?.total || 0);
  const items = Array.isArray(order?.items) ? order.items : [];

  if (!recipient) {
    throw new Error("Receipt email recipient is required");
  }

  if (!orderNumber) {
    throw new Error("Order number is required");
  }

  const itemRowsHtml = items
    .map((item) => {
      const name = String(item?.name || `Product #${item?.product_id || ""}`).trim();
      const quantity = Number(item?.qty || item?.quantity || 0);
      const subtotal = Number(item?.subtotal || 0);
      return `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee3d4; color: #23150c;">${name}</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee3d4; color: #23150c; text-align: center;">${quantity}</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee3d4; color: #23150c; text-align: right;">${currency} ${subtotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  const summaryRows = [
    ["Order Number", orderNumber],
    ["Order Type", orderType],
    ["Payment Method", paymentMethod],
    ["Payment Status", paymentStatus],
    ["Subtotal", `${currency} ${subtotalAmount.toFixed(2)}`],
    ["Tax", `${currency} ${taxAmount.toFixed(2)}`],
    ["Service Charge", `${currency} ${serviceChargeAmount.toFixed(2)}`],
    ["Total", `${currency} ${total.toFixed(2)}`],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 6px 0; color: #6b7280; width: 38%;">${label}</td>
          <td style="padding: 6px 0; color: #23150c; font-weight: 600;">${value}</td>
        </tr>
      `,
    )
    .join("");

  const contactRows = [
    restaurantSettings.tagline,
    restaurantSettings.address,
    restaurantSettings.phone,
    restaurantSettings.email,
  ]
    .filter(Boolean)
    .map(
      (line) => `
        <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #6b7280;">${line}</p>
      `,
    )
    .join("");

  await resend.emails.send({
    from,
    to: recipient,
    subject: `Order Confirmation ${orderNumber} - ${restaurantName}`,
    html: `
      <div style="font-family: Arial, sans-serif; background: #f7f3ee; padding: 24px; color: #23150c;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #eadfce;">
          <p style="margin: 0 0 12px; font-size: 14px; color: #8a6d3b; text-transform: uppercase; letter-spacing: 0.12em;">${restaurantName}</p>
          <h1 style="margin: 0 0 14px; font-size: 24px; color: #23150c;">Your order confirmation</h1>
          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7;">Hi ${safeName},</p>
          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7;">
            Thanks for ordering from ${restaurantName}. Here are the details of your online order.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px;">
            <tbody>${summaryRows}</tbody>
          </table>

          <div style="margin-bottom: 18px;">
            <p style="margin: 0 0 10px; font-size: 14px; font-weight: 700; color: #23150c;">Items</p>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="padding: 0 0 10px; text-align: left; color: #6b7280; font-size: 12px;">Item</th>
                  <th style="padding: 0 0 10px; text-align: center; color: #6b7280; font-size: 12px;">Qty</th>
                  <th style="padding: 0 0 10px; text-align: right; color: #6b7280; font-size: 12px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemRowsHtml}</tbody>
            </table>
          </div>

          <div style="padding: 16px; border-radius: 14px; background: #fff8e1; border: 1px solid #f2d48a;">
            <p style="margin: 0 0 6px; font-size: 13px; font-weight: 700; color: #5a3712;">Order Note</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #5a3712;">${note}</p>
          </div>
          ${
            contactRows
              ? `<div style="margin-top: 18px; padding-top: 18px; border-top: 1px solid #eee3d4;">${contactRows}</div>`
              : ""
          }
        </div>
      </div>
    `,
    text: `Hi ${safeName}, your ${restaurantName} order ${orderNumber} is confirmed. Order type: ${orderType}. Payment method: ${paymentMethod}. Payment status: ${paymentStatus}. Total: ${currency} ${total.toFixed(2)}. ${note}`,
  });
}

async function sendPasswordResetEmail({
  to,
  code,
  customerName,
}) {
  const recipient = String(to || "").trim();
  const safeName = String(customerName || "Customer").trim() || "Customer";
  const resetCode = String(code || "").trim();

  if (!recipient) {
    throw new Error("Password reset email recipient is required");
  }

  if (!resetCode) {
    throw new Error("Password reset code is required");
  }

  if (shouldUseConsoleEmailFallback()) {
    logDevelopmentOtpEmail({
      flow: "password_reset",
      to: recipient,
      code: resetCode,
      customerName: safeName,
    });
    return {
      id: "console-dev-password-reset",
      provider: "console",
      to: recipient,
    };
  }

  const resend = getResendClient();
  const from = getSender();
  const restaurantSettings = await loadRestaurantSettings();
  const restaurantName = restaurantSettings.restaurantName;
  const result = await resend.emails.send({
    from,
    to: recipient,
    subject: `Reset your password - ${restaurantName}`,
    html: `
      <div style="font-family: Arial, sans-serif; background: #f7f3ee; padding: 24px; color: #23150c;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #eadfce;">
          <p style="margin: 0 0 12px; font-size: 14px; color: #8a6d3b; text-transform: uppercase; letter-spacing: 0.12em;">${restaurantName}</p>
          <h1 style="margin: 0 0 16px; font-size: 24px; color: #23150c;">Reset your password</h1>
          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7;">Hi ${safeName},</p>
          <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7;">
            Use the 6-digit code below to reset your password. This code expires in 10 minutes.
          </p>
          <div style="margin: 24px 0; padding: 18px; text-align: center; background: #fff8e1; border: 1px solid #f2d48a; border-radius: 14px;">
            <div style="font-size: 30px; font-weight: 700; letter-spacing: 0.3em; color: #5a3712;">${resetCode}</div>
          </div>
          <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #6b7280;">
            If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
      </div>
    `,
    text: `Hi ${safeName}, your ${restaurantName} password reset code is ${resetCode}. This code expires in 10 minutes.`,
  });

  if (result?.error) {
    const resendError = new Error(
      typeof result.error === "string"
        ? result.error
        : result.error?.message || "Unknown Resend error",
    );
    resendError.name = result.error?.name || "ResendPasswordResetError";
    resendError.statusCode = result.error?.statusCode;
    resendError.response = result.error?.response || result;
    resendError.cause = result.error?.cause;
    resendError.resendError = result.error;
    throw resendError;
  }

  return result;
}

module.exports = {
  sendVerificationEmail,
  sendCustomerOrderReceiptEmail,
  sendPasswordResetEmail,
};
