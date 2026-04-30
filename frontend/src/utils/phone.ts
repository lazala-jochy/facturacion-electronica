const PHONE_DIGITS = 10;
const PHONE_REGEX = /^[0-9]{3}-[0-9]{3}-[0-9]{4}$/;

export const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, PHONE_DIGITS);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const isValidPhone = (value: string) => PHONE_REGEX.test(value.trim());
