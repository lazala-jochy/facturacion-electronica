export const isValidRnc = (rnc: string) => /^[0-9]{9,11}$/.test(rnc);

export const isValidEmailFormat = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isValidPasswordLength = (password: string) => password.length >= 8;
