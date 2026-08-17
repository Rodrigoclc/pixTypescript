import pool from "../config/connection.js";
import { account } from "./account.js";

export interface ITransfer {
  payerId: string;
  payeeId: string;
  amount: number;
  idempotencyKey: string;
}

export class Transfer {
  private queue = new Map<string, ITransfer>();
  private cont = 0;

  public hasIdempotencyKey(payload: ITransfer): ITransfer | undefined {
    const res = this.queue.get(payload.idempotencyKey);

    if (res) {
      console.log(`Repetida ${this.cont++}: `, res);
      return res;
    }
    this.queue.set(payload.idempotencyKey, payload);
    return res;
  }

  public async create(transfer: ITransfer): Promise<void> {
    const hasAccountId = account.hasAccountId(transfer.payerId);
    if (!hasAccountId) return;

    // const client = await pool.connect();
    try {

      const accountId = await pool.query(`
        SELECT id FROM accounts
        WHERE id = '${transfer.payerId}'`);

      if (accountId.rows.length === 0) return;

      const queryTransfers = `
        INSERT INTO transfers (payer_id, payee_id, amount, idempotency_key)
        values($1, $2, $3, $4)
        RETURNING id`;
      const valuesTransfers = Object.values(transfer);

      const transferId = await pool.query(queryTransfers, valuesTransfers);

      const queryGetBalance = `
        SELECT balance FROM accounts
        WHERE id = $1
        LIMIT 1`;

      const valuesQueryGetBalance = [transfer.payerId];

      const getBalanceResult = await pool.query(
        queryGetBalance,
        valuesQueryGetBalance,
      );

      const balance = getBalanceResult.rows[0].balance as number;

      const status = balance >= transfer.amount ? "completed" : "failed";

      const failureReason = status === "failed" ? "insufficient_funds" : null;

      await pool.query("BEGIN TRANSACTION;");

      const withdral = await pool.query(
        `        
        UPDATE accounts
        SET balance = balance - $1
        WHERE id = $2;`,
        [transfer.amount, transfer.payerId],
      );

      const deposit = await pool.query(
        `
        UPDATE accounts
        SET balance = balance + $1
        WHERE id = $2;`,
        [transfer.amount, transfer.payeeId],
      );

      let updateTransferQuery = `
        UPDATE transfers
        SET status = '${status}'
        `;

      if (failureReason) {
        updateTransferQuery = updateTransferQuery + `, failure_reason = '${failureReason}'`;
      }

      const a = transferId.rows[0];
      updateTransferQuery =
        updateTransferQuery + ` , processed_at = now() WHERE id = '${transferId.rows[0].id}';`;

      const res = await pool.query(updateTransferQuery);

      await pool.query(" COMMIT;");

    } catch (error) {
      await pool.query("ROLLBACK");
      console.error(error);
    }
  }

  public async getById(id: string) {
    const query = `SELECT * FROM transfers WHERE id = $1`;
    const values = [id];

    try {
      return await pool.query(query, values);
    } catch (error) {
      console.error(error);
    }
  }
}
