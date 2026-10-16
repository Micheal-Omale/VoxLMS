// Nigerian mobile numbers in one stored format: +234 followed by 10 digits
// (spec 0003). Accepts the ways people actually type them:
// 0803 123 4567, 08031234567, 2348031234567, +234 803 123 4567, 803-123-4567.

const NIGERIAN_MOBILE = /^\+234[789][01]\d{8}$/;

/** Returns the number as +234XXXXXXXXXX, or null if it isn't a Nigerian mobile number. */
export function normaliseNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  let candidate: string;
  if (digits.startsWith("+234")) candidate = digits;
  else if (digits.startsWith("234")) candidate = `+${digits}`;
  else if (digits.startsWith("0") && digits.length === 11) candidate = `+234${digits.slice(1)}`;
  else if (digits.length === 10) candidate = `+234${digits}`;
  else return null;
  return NIGERIAN_MOBILE.test(candidate) ? candidate : null;
}

/** For display: +234 803 123 4567. */
export function formatNigerianPhone(phone: string): string {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return match ? `+234 ${match[1]} ${match[2]} ${match[3]}` : phone;
}
