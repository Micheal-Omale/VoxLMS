// Password rules (spec 0004, AC-4): length by role, no common passwords, not
// the person's own phone number. Messages say exactly what to change.

const COMMON = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "654321", "111111", "000000",
  "121212", "123123", "112233", "666666", "888888", "999999", "555555", "222222", "777777",
  "123321", "147258", "159753", "987654", "abc123", "abcdef", "qwerty", "qwerty123", "asdfgh",
  "password", "password1", "passw0rd", "iloveyou", "welcome", "letmein", "monkey", "dragon",
  "football", "princess", "sunshine", "master", "admin", "admin123", "teacher", "teacher1",
  "school", "school1", "student", "nigeria", "lagos", "abuja", "jesus", "jesus1", "god", "godisgood",
  "allah", "blessing", "favour", "precious", "chelsea", "arsenal", "voxlms",
]);

export type PasswordOwner = { phoneDigits: string | null; isTeam: boolean };

/** Returns a message saying what's wrong, or null if the password is fine. */
export function passwordProblem(password: string, owner: PasswordOwner): string | null {
  const min = owner.isTeam ? 12 : 6;
  if (password.length < min) return `Use at least ${min} characters.`;
  if (password.length > 128) return "Use 128 characters or fewer.";
  if (COMMON.has(password.toLowerCase())) return "That password is too easy to guess. Choose something less common.";
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character. Choose something less easy to guess.";
  if (owner.phoneDigits) {
    const digits = password.replace(/\D/g, "");
    const local = `0${owner.phoneDigits.slice(3)}`;
    if (digits.length >= 6 && (owner.phoneDigits.includes(digits) || local.includes(digits))) {
      return "Don't use your phone number as your password.";
    }
  }
  return null;
}
