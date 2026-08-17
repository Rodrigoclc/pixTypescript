import http from "node:http";
import pool from "./config/connection.js";
import { account } from "./worker/account.js";
import { ITransfer, Transfer } from "./worker/transfer.js";

const PORT = process.env.PORT || 3003;

const transfer = new Transfer();

function isAbsolute(n: number): boolean {
  return n === Math.abs(n) || n <= 0;
}

async function getBody(req: http.IncomingMessage) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString();

  return JSON.parse(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  // -GET /health
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    return res.end(
      JSON.stringify({
        status: "ok",
      }),
    );
  }

  // -POST /accounts
  if (req.method === "POST" && url.pathname === "/accounts") {
    const body = await getBody(req);

    if (!body.id || !body.balance || !isAbsolute(Number(body.balance))) {
      res.writeHead(422, {
        "Content-Type": "application/json",
      });
      return res.end();
    }

    const hasAccountId = account.hasAccountId(body.id);
    if (hasAccountId) {
      res.writeHead(409, {
        "Content-Type": "application/json",
      });

      return res.end();
    }

    account.create(body.id, body.balance);

    res.writeHead(201, {
      "Content-Type": "application/json",
    });

    return res.end();
  }

  // -POST /transfers
  if (req.method === "POST" && url.pathname === "/transfers") {
    const body = await getBody(req);

    if (
      !body.payerId ||
      !body.payeeId ||
      body.payerId === body.payeeId ||
      !body.amount ||
      !isAbsolute(body.amount) ||
      !body.idempotencyKey
    ) {
      res.writeHead(422, {
        "Content-Type": "application/json",
      });

      return res.end();
    }

    const payload: ITransfer = {
      payerId: body.payerId,
      payeeId: body.payeeId,
      amount: body.amount,
      idempotencyKey: body.idempotencyKey,
    };

    const hasIdempotencyKey = transfer.hasIdempotencyKey(payload);
    if (hasIdempotencyKey) {
      res.writeHead(200, {
        "Content-Type": "application/json",
      });

      return res.end(JSON.stringify(hasIdempotencyKey));
    }

    transfer.create(payload);

    res.writeHead(201, {
      "Content-Type": "application/json",
    });

    return res.end();
  }

  // -GET /transfers/id
  if (req.method === "GET" && parts[0] === "transfers" && parts[1]) {
    const transferId = parts[1];

    const resTransfer = await transfer.getById(transferId);

    if (!resTransfer) {
      res.writeHead(404, {
        "Content-Type": "application/json",
      });

      return res.end();
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    return res.end(JSON.stringify(resTransfer));
  }

  if (
    req.method === "GET" &&
    parts[0] === "accounts" &&
    parts[1] &&
    parts[2] === "statement"
  ) {
    const accountId = parts[1];

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(
      JSON.stringify({
        error: "Route not found",
      }),
    );

    // buscar extrato da conta...
  }

  res.writeHead(404, {
    "Content-Type": "application/json",
  });

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
