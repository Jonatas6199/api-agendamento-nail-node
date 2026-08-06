// Remove tudo que não for dígito
function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(phone) {
  return onlyDigits(phone);
}

function normalizeCpf(cpf) {
  return onlyDigits(cpf);
}

function normalizeAnoNascimento(anoNascimento) {
  return onlyDigits(anoNascimento);
}

// Validação do dígito verificador do CPF (algoritmo padrão)
function isValidCPF(rawCpf) {
  const cpf = normalizeCpf(rawCpf);

  if (cpf.length !== 11) return false;
  // Rejeita CPFs com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf[i], 10) * (10 - i);
  }
  let firstCheck = 11 - (sum % 11);
  if (firstCheck >= 10) firstCheck = 0;
  if (firstCheck !== parseInt(cpf[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf[i], 10) * (11 - i);
  }
  let secondCheck = 11 - (sum % 11);
  if (secondCheck >= 10) secondCheck = 0;
  if (secondCheck !== parseInt(cpf[10], 10)) return false;

  return true;
}

function isValidAnoNascimento(anoNascimento) {
  const normalized = normalizeAnoNascimento(anoNascimento);
  // Aceita anos de nascimento com 4 dígitos
  if(normalized > new Date().getFullYear()) return false; // não aceita anos futuros
  return normalized.length === 4 && !isNaN(normalized);
}

function isValidPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  // Aceita telefones brasileiros com DDD (10 ou 11 dígitos)
  return phone.length === 10 || phone.length === 11;
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  onlyDigits,
  normalizePhone,
  normalizeCpf,
  isValidCPF,
  isValidPhone,
  isValidEmail,
};
