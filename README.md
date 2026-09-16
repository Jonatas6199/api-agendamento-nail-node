# Nail Scheduling API

API de agendamentos para sistema de nail design. Node.js + Express + Prisma + PostgreSQL (Supabase) + Google Calendar.

## 1. Instalação

```bash
npm install
```

## 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

- **DATABASE_URL**: string de conexão do Supabase (Project Settings > Database > Connection string). Recomenda-se usar a porta de **connection pooling (6543)** com `?pgbouncer=true` em produção.
- **GOOGLE_SERVICE_ACCOUNT_KEY_PATH**: caminho para o JSON da conta de serviço baixado no Google Cloud.
- **GOOGLE_CALENDAR_ID**: ID da agenda da profissional (geralmente o e-mail da conta Google, ex: `profissional@gmail.com`).

Coloque o arquivo JSON da conta de serviço na raiz do projeto (ou aponte o caminho correto na env), por exemplo `google-service-account.json`. **Nunca** commite esse arquivo — adicione-o ao `.gitignore`.

### ⚠️ Passo importante do Google Calendar

Uma conta de serviço **não enxerga automaticamente** a agenda pessoal da profissional. É necessário compartilhar a agenda com o e-mail da conta de serviço (algo como `xxx@seuprojeto.iam.gserviceaccount.com`, encontrado dentro do JSON baixado):

1. Abra o Google Agenda da profissional.
2. Configurações > "Configurações do meu calendário" > selecione a agenda.
3. Em "Compartilhar com pessoas específicas", adicione o e-mail da conta de serviço.
4. Dê permissão de **"Fazer alterações nos eventos"**.

Sem esse passo, a API receberá erro 404/403 ao tentar criar eventos.

## 3. Banco de dados (Prisma + Supabase)

Gerar o client e aplicar as migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Popular dados iniciais (procedimentos e horário de funcionamento de exemplo):

```bash
npm run seed
```

> Edite `prisma/seed.js` para refletir os procedimentos, valores e horários reais do salão antes de rodar em produção.

## 4. Rodar a API

```bash
npm run dev   # com reload automático
# ou
npm start
```

A API sobe em `http://localhost:3333` (ou na porta definida em `PORT`).

## 5. Fluxo de uso / Endpoints

### Login (telefone + CPF)
```
POST /api/auth/login
Body: { "phone": "11999998888", "cpf": "12345678900", "name"?, "source"? }
```
Cria o usuário automaticamente se o telefone ainda não existir. Se o telefone já existir, valida se o CPF confere.

### Atualizar dados opcionais do usuário
```
PATCH /api/users/:id
Body: { "name"?, "source"? }
```

### Listar procedimentos
```
GET /api/procedures
```
Retorna nome, valor (`price`) e tempo médio (`durationMin`) de cada procedimento ativo.

### Consultar horários disponíveis
```
GET /api/availability?procedureId=xxx&date=2026-08-10
```
Retorna uma lista de `{ startTime, endTime }` (ISO 8601) livres para aquele procedimento naquele dia, já considerando horário de funcionamento, bloqueios e agendamentos existentes.

### Criar agendamento (com ficha de anamnese)
```
POST /api/appointments
Body: {
  "userId": "...",
  "procedureId": "...",
  "startTime": "2026-08-10T14:00:00.000Z",
  "clientEmail": "cliente@email.com",   // opcional - se enviado, recebe convite do Google Agenda
  "anamnesis": {
    "isFirstVisit": true,
    "usesGelPolish": true,
    "hasCosmeticAllergy": false,
    "cosmeticAllergyDetails": null,
    "hasFrequentLifting": false,
    "usesContinuousMedication": true,
    "continuousMedicationDetails": "Medicamento informado pela cliente"
  }
}
```
Revalida a disponibilidade no momento da confirmação (evita conflito de dois clientes agendando o mesmo horário) e cria o evento no Google Agenda da profissional.

O campo `isFirstVisit` é validado pela API. Se já existir qualquer agendamento para o usuário, ele será salvo como `false`, independentemente do valor enviado pelo frontend.

### Consultar status da ficha e primeira visita
```
GET /api/users/:id/anamnesis-status
```
Retorna se a ficha é obrigatória, se o usuário possui agendamentos anteriores e se deve ser tratado como primeira visita.

### Listar agendamentos do cliente
```
GET /api/appointments?userId=xxx&status=SCHEDULED
```

### Reagendar
```
PATCH /api/appointments/:id/reschedule
Body: { "startTime": "2026-08-11T15:00:00.000Z" }
```

### Cancelar
```
PATCH /api/appointments/:id/cancel
```
Marca o agendamento como `CANCELLED` e remove o evento correspondente do Google Agenda.

## 6. Estrutura de pastas

```
prisma/
  schema.prisma        # modelos do banco
  seed.js               # dados iniciais (procedimentos, horários)
src/
  config/
    prisma.js           # instância única do PrismaClient
  middleware/
    asyncHandler.js
    errorHandler.js
  routes/
    auth.routes.js
    users.routes.js
    procedures.routes.js
    availability.routes.js
    appointments.routes.js
  services/
    availabilityService.js   # regra de cálculo de horários livres
    googleCalendarService.js # integração com Google Calendar
  utils/
    validators.js       # validação de CPF, telefone, e-mail
  app.js
  server.js
```

## 7. Observações e próximos passos sugeridos

- **Horário de funcionamento e bloqueios** (`WorkingHours`, `BlockedDate`) hoje só podem ser editados via Prisma Studio (`npm run prisma:studio`) ou diretamente no banco. Se quiser, dá para criar rotas administrativas (`/api/admin/...`) protegidas por autenticação para editar isso pela própria aplicação.
- **Autenticação/autorização**: o login atual por telefone+CPF é adequado para identificar o cliente, mas não gera token de sessão. Se o frontend precisar manter sessão persistente seria interessante adicionar JWT nesse endpoint de login.
- **Concorrência**: a checagem de disponibilidade é feita duas vezes (na consulta de slots e na confirmação), mas em cenários de altíssima concorrência considere adicionar uma constraint de exclusão no Postgres (`EXCLUDE USING gist`) para garantir atomicidade a nível de banco.
- **Notificações**: hoje o convite por e-mail é feito pelo próprio Google Calendar (`sendUpdates: 'all'`). Se quiser enviar SMS/WhatsApp de confirmação, dá pra plugar isso no mesmo ponto onde o evento é criado.

## 8. Painel administrativo

As rotas sob `/api/admin` exigem dois headers emitidos no login:

```text
Authorization: Bearer <jwt>
X-Admin-API-Key: <chave-de-sessao>
```

A chave é aleatória, tem validade curta e somente seu hash é armazenado no banco. Ela não deve ser configurada como variável `VITE_*` nem embutida no frontend.

### Variáveis necessárias

```env
ADMIN_JWT_SECRET=segredo-aleatorio-com-no-minimo-32-caracteres
ADMIN_SESSION_HOURS=8
CORS_ORIGINS=https://seu-front-cliente.vercel.app,https://seu-painel.vercel.app
BUSINESS_REVIEW_URL=https://link-opcional-de-avaliacao
```

Em produção, as rotas administrativas recusam tráfego que não tenha sido encaminhado por HTTPS.

### Criar ou atualizar o administrador

Defina temporariamente `ADMIN_USERNAME` e `ADMIN_PASSWORD` no ambiente local ou do comando. A senha deve ter pelo menos 12 caracteres.

```bash
npm run admin:create
```

O script salva somente o hash bcrypt da senha.

### Principais rotas

- `POST /api/admin/auth/login`
- `GET /api/admin/auth/session`
- `POST /api/admin/auth/logout`
- `GET /api/admin/dashboard`
- `GET|POST /api/admin/appointments`
- `GET|PATCH /api/admin/appointments/:id`
- `PATCH /api/admin/appointments/:id/confirm`
- `PATCH /api/admin/appointments/:id/reschedule`
- `PATCH /api/admin/appointments/:id/complete`
- `PATCH /api/admin/appointments/:id/cancel`
- `GET|POST /api/admin/clients`
- `GET|PATCH /api/admin/clients/:id`
- `GET|POST /api/admin/finances`
- `PATCH|DELETE /api/admin/finances/:id`
- `GET /api/admin/settings`
- CRUD administrativo de procedimentos, expediente e datas bloqueadas em `/api/admin/settings/*`

Pagamentos registrados nos agendamentos são sincronizados automaticamente como entradas financeiras. Entradas manuais e despesas podem ser gerenciadas pelas rotas de finanças; lançamentos vinculados a agendamentos devem ser alterados no próprio agendamento.
