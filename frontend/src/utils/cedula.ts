const CEDULA_DIGITS = 11;

export const cedulaDigits = (value: string) =>
  value.replace(/\D/g, "").slice(0, CEDULA_DIGITS);

export const formatCedulaInput = (value: string) => {
  const digits = cedulaDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
};
