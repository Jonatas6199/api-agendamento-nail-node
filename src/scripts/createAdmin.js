require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

async function main() {
  const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');

  if (!username || password.length < 12) {
    throw new Error('Defina ADMIN_USERNAME e uma ADMIN_PASSWORD com pelo menos 12 caracteres.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.upsert({
    where: { username },
    update: { passwordHash, active: true },
    create: { username, passwordHash },
  });

  console.log(`Administrador "${username}" criado ou atualizado com sucesso.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
