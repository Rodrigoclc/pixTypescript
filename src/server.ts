import http from "node:http";
import pool from "./config/connection.js";
import { account } from "./worker/account.js";
import { ITransfer, Transfer } from "./worker/transfer.js";
import vine from "@vinejs/vine";
import { createAccountValidator } from "./validator/accountValidator.js";

const PORT = process.env.PORT || 3003;

const transfer = new Transfer();

async function getBody(req: http.IncomingMessage) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString();

  return JSON.parse(body);
}

export interface AccountCreate {
  id: string,
  balance: number
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  let headers = {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
  };

  // -GET /health
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(headers.statusCode, headers.headers);
    return res.end(
      JSON.stringify({
        status: "ok",
      }),
    );
  }

  // -POST /accounts
  if (req.method === "POST" && url.pathname === "/accounts") {
    const body = await getBody(req);

    const payload: AccountCreate = {
      id: body.id,
      balance: body.balance,
    };

    if (
      payload.id === undefined ||
      payload.id === null ||
      payload.id.split("").length < 1 ||
      payload.balance < 0 ||
      payload.balance === null ||
      payload.balance === undefined ||
      payload.balance.toString().split(".").length > 1
    ) {
      headers.statusCode = 422;
      res.writeHead(headers.statusCode, headers.headers);
      console.log(`-POST /accounts statusCode-${headers.statusCode} `, payload);
      return res.end(JSON.stringify(payload));
    }

    const hasAccountId = account.hasAccountId(body.id);
    if (hasAccountId) {
      headers.statusCode = 409;
      res.writeHead(headers.statusCode, headers.headers);
      console.log(`-POST /accounts statusCode-${headers.statusCode} `, payload);

      return res.end(JSON.stringify(payload));
    }

    account.create(payload.id, payload.balance);

    headers.statusCode = 201;
    res.writeHead(headers.statusCode, headers.headers);
    console.log(`-POST /accounts statusCode-${headers.statusCode} `, payload);
    return res.end(JSON.stringify(payload));
  }

  // -POST /transfers
  if (req.method === "POST" && url.pathname === "/transfers") {
    const body = await getBody(req);

    const payload: ITransfer = {
      payerId: body.payerId,
      payeeId: body.payeeId,
      amount: body.amount,
      idempotencyKey: body?.idempotencyKey,
    };

    if (
      !payload.payerId ||
      !payload.payeeId ||
      payload.payerId === payload.payeeId ||
      (payload.amount < 0 ||
      payload.amount === null ||
      payload.amount === undefined ||
      payload.amount.toString().split(".").length > 1) ||
      payload.idempotencyKey === null ||
      payload.idempotencyKey === undefined
    ) {
      headers.statusCode = 422;
      res.writeHead(headers.statusCode, headers.headers);
      console.log(`-POST /transfers statusCode-${headers.statusCode} `, payload);

      return res.end(JSON.stringify(payload));
    }

    const hasIdempotencyKey = transfer.hasIdempotencyKey(payload);
    if (hasIdempotencyKey) {
      headers.statusCode = 200;
      res.writeHead(headers.statusCode, headers.headers);
      console.log(`-POST /transfers statusCode-${headers.statusCode} `, payload);

      return res.end(JSON.stringify(payload));
    }

    transfer.create(payload);

    headers.statusCode = 201;
    res.writeHead(headers.statusCode, headers.headers);
    //console.log(`-POST /transfers statusCode-${headers.statusCode} `, payload);

    return res.end(JSON.stringify({ status: "pending" }));
  }

  // -GET /transfers/id
  if (req.method === "GET" && parts[0] === "transfers" && parts[1]) {
    const transferId = parts[1];

    const resTransfer = await transfer.getById(transferId);

    if (!resTransfer) {
      headers.statusCode = 404;

      return res.end();
    }

    return res.end(JSON.stringify(resTransfer));
  }

  // -GET /accounts/id/statement
  if (
    req.method === "GET" &&
    parts[0] === "accounts" &&
    parts[1] &&
    parts[2] === "statement"
  ) {
    const accountId = parts[1];

    const accountWithTransfer = await account.getById(accountId);

    if (!accountWithTransfer) {
      headers.statusCode = 404;

      return res.end();
    }

    return res.end(JSON.stringify(accountWithTransfer));
  }

  headers.statusCode = 404;

  res.end(
    JSON.stringify({
      error: "Route not found",
    }),
  );
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  testConnection();
});

async function testConnection() {
  try {
    await pool.query(`
      DROP SCHEMA public CASCADE;`);
    await pool.query(`
      CREATE SCHEMA public;`);
    await pool.query(`
      GRANT ALL ON SCHEMA public TO public;`);
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE accounts (
          id VARCHAR(64) PRIMARY KEY,
          balance BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE transfers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          payer_id VARCHAR(64) NOT NULL REFERENCES accounts(id),
          payee_id VARCHAR(64) NOT NULL REFERENCES accounts(id),
          amount BIGINT NOT NULL,
          idempotency_key VARCHAR(128) UNIQUE,
          status VARCHAR(16) NOT NULL DEFAULT 'pending',
          failure_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          processed_at TIMESTAMPTZ
      );

      -- Índice que serve o worker: as pendentes, na ordem em que chegaram
      CREATE INDEX idx_transfers_pending ON transfers (created_at) WHERE status = 'pending';
      CREATE INDEX idx_transfers_payer ON transfers (payer_id);
      CREATE INDEX idx_transfers_payee ON transfers (payee_id);
      CREATE INDEX idx_transfers_status ON transfers (status);
      `);
    const res = await pool.query(`SELECT NOW()`);
    console.log("Conexão realizada em: ", res.rows[0].now);
  } catch (error) {
    console.error("Erro ao conectar ao PostgreSQL: ", error);
  }
}
