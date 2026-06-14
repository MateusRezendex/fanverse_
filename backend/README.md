# Backend — Sabor que Vicia

Backend Node.js + Express + PostgreSQL + WebSocket.

## Pré-requisitos

- Node.js 18+
- PostgreSQL rodando localmente

## Setup

```bash
# 1. Instalar dependências
cd backend
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite .env e ajuste DATABASE_URL

# 3. Criar o banco no PostgreSQL (uma vez)
#    psql -U postgres -c "CREATE DATABASE sabor;"

# 4. Rodar migrations
npm run migrate

# 5. Subir o servidor
npm start
# (ou: npm run dev — usa --watch e reinicia ao mudar)
```

Abra `http://localhost:3000` — o backend serve os HTMLs e a API na mesma origem.

## Validacao

```bash
npm run check
npm run smoke -- http://localhost:3000
```

## API

| Método | Rota                              | Descrição                                |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/api/health`                     | health-check                             |
| GET    | `/api/flavors`                    | lista sabores                            |
| POST   | `/api/flavors`                    | cria sabor                               |
| PATCH  | `/api/flavors/:id`                | atualiza sabor (preço, disponibilidade…) |
| DELETE | `/api/flavors/:id`                | remove sabor                             |
| GET    | `/api/orders`                     | lista pedidos com itens                  |
| POST   | `/api/orders`                     | cria pedido (ID gerado automaticamente)  |
| PATCH  | `/api/orders/:id`                 | atualiza status / itens                  |
| DELETE | `/api/orders/:id`                 | remove pedido                            |
| GET    | `/api/orders/customers/aggregate` | clientes agregados a partir dos pedidos  |
| GET    | `/api/orders/stats/weekly`        | faturamento últimos 7 dias               |

## WebSocket

Conecte em `ws://localhost:3000/ws`. Mensagens enviadas pelo servidor:

```jsonc
{ "type": "flavor:created", "payload": { /* flavor */ } }
{ "type": "flavor:updated", "payload": { /* flavor */ } }
{ "type": "flavor:deleted", "payload": { "id": 12 } }
{ "type": "order:created",  "payload": { /* order */ } }
{ "type": "order:updated",  "payload": { /* order */ } }
{ "type": "order:deleted",  "payload": { "id": "#1003" } }
```

O cliente (`js/db.js`) já trata todos esses eventos e re-renderiza a página.

## Integração com WhatsApp

Webhook agnóstico de provedor em `POST /webhook/whatsapp`. Qualquer integração
(Cloud API, Z-API, Twilio, n8n, Zapier) pode chamá-lo enviando:

```http
POST /webhook/whatsapp
X-Webhook-Secret: <opcional, se WHATSAPP_WEBHOOK_SECRET configurado>
Content-Type: application/json

{ "from": "+5581999999999", "text": "Nome: João\nEndereço: ..." }
```

### Formato esperado da mensagem

```
Nome: João Silva
Telefone: (81) 99999-9999
Endereço: Rua X, 100 - Boa Viagem
Pagamento: Pix
5x Frango com Catupiry
3x Queijo
Obs: sem cebola
```

Linhas no formato `<n>x <sabor>` viram itens. O sabor é resolvido contra o
cardápio com normalização (case/acentos) e match por substring.

### Habilitando notificações de saída

```dotenv
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=cloudapi          # ou zapi
WHATSAPP_WEBHOOK_SECRET=algum-segredo
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...           # usado pela Meta no GET de verificação
```

O backend dispara mensagens automaticamente nestes eventos:

- pedido criado → confirmação com itens, total e endereço
- status muda para `Em Preparo` / `Pronto` / `Entregue` / `Cancelado`

### Testando localmente

```bash
curl -X POST http://localhost:3000/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+5581999998888",
    "text": "Nome: Teste\nEndereço: Rua Y, 200\nPagamento: Pix\n2x Frango com Catupiry\n1x Queijo"
  }'
```

Com `WHATSAPP_ENABLED=false`, o pedido é criado normalmente e as mensagens são
apenas logadas no console (provider `noop`).
