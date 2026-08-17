import { QueryResult } from "pg";
import pool from "../config/connection.js";

export interface AccountRequest {
  id: string;
  balance: number;
}

class Account {
  private queue = new Map<string, number>();

  public hasAccountId(id: string): boolean {
    return this.queue.has(id);
  }

  public create(id: string, balance: number): void {
    this.queue.set(id, balance);

    console.log(id, balance)
    const query = `INSERT INTO accounts (id, balance) values($1, $2)`;
    const values = [id, balance];

    try {
      pool.query(query, values);
    } catch (error) {
      console.error(error);
    }
  }

  public async getById(id: string) {
    try {
      await pool.query("BEGIN TRANSACTION;");
      const accountQuery = `
      SELECT id, balance 
      FROM accounts
      WHERE id = '${id}'
     `;

      const accountResultQuery = await pool.query(accountQuery);

      const transferQuery = `
      SELECT id, payer_id as payerId, payee_id as payeeId, amount, idempotency_key as idempotencyKey, status, failure_reason as failureReason, created_at as createdAt
      FROM transfers
      WHERE payer_id = '${accountResultQuery.rows[0].id}'
     `;

      const transferResultQuery = await pool.query(transferQuery);

      await pool.query(" COMMIT;");

      return {
        accountId: accountResultQuery.rows[0]?.id,
        balance: accountResultQuery.rows[0]?.balance,
        transfers: transferResultQuery.rows,
      };
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error(error);
    }
  }
}

export const account = new Account();
