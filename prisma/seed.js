const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Procedimentos de exemplo - ajuste nomes, preços e durações conforme sua tabela real
  await prisma.procedure.createMany({
    data: [
      { name: 'Esmaltação em Gel', price: 45.0, durationMin: 45 },
      { name: 'Alongamento em Fibra', price: 120.0, durationMin: 120 },
      { name: 'Alongamento no molde F1', price: 130.0, durationMin: 120 },
      { name: 'Manutenção de Alongamento', price: 90.0, durationMin: 90 },
      { name: 'Spa dos Pés', price: 60.0, durationMin: 60 },
    ],
    skipDuplicates: true,
  });

  // Horário de funcionamento: Terça a Sábado, 09:00 às 18:00 (ajuste como preferir)
  const workingHours = [
    { weekday: 2, startTime: '09:00', endTime: '18:00' }, // terça
    { weekday: 3, startTime: '09:00', endTime: '18:00' }, // quarta
    { weekday: 4, startTime: '09:00', endTime: '18:00' }, // quinta
    { weekday: 5, startTime: '09:00', endTime: '18:00' }, // sexta
    { weekday: 6, startTime: '09:00', endTime: '15:00' }, // sábado
  ];

  for (const wh of workingHours) {
    await prisma.workingHours.upsert({
      where: { weekday: wh.weekday },
      update: wh,
      create: wh,
    });
  }

  console.log('Seed concluído com sucesso.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
