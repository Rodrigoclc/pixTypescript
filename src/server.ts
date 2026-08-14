import http from "node:http";
import pool from "./config/connection.js";
import { Account } from "./worker/account.js";
import { ITransfer, Transfer } from "./worker/transfer.js";

const PORT = process.env.PORT || 3003;

const account = new Account();
const transfer = new Transfer();

async function testConnection() {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("Conexão realizada em: ", res.rows[0].now);
  } catch (error) {
    console.error("Erro ao conectar ao PostgreSQL: ", error);
  } finally {
    await pool.end();
  }
}

function isAbsolute(n: number): boolean {
  return n === Math.abs(n) || n <= 0;
}

async function getBody(req: http.IncomingMessage) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString();
  console.log(body);

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

    const hasAccountId = await account.hasAccountId(body.id);
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

    const hasIdempotencyKey = transfer.hasIdempotencyKey(body.idempotencyKey);
    if (hasIdempotencyKey) {
      res.writeHead(200, {
        "Content-Type": "application/json",
      });

      return res.end(JSON.stringify(hasIdempotencyKey));
    }

    const payload: ITransfer = {
      payerId: body.payeeId,
      payeeId: body.payee_id,
      amount: body.amount,
      idempotencyKey: body.idempotencyKey,
    };

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

    res.writeHead(201, {
      "Content-Type": "application/json",
    });

    return res.end(JSON.stringify(resTransfer));
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
