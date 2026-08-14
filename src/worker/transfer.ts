import pool from "../config/connection.js";

export interface ITransfer {
  payerId: string;
  payeeId: string;
  amount: number;
  idempotencyKey: string;
}

export class Transfer {
  private queue = new Map<string, ITransfer>();

  public hasIdempotencyKey(idempotencyKey: string): ITransfer | undefined {
    return this.queue.has(idempotencyKey)
      ? this.queue.get(idempotencyKey)
      : undefined;
  }

  public create(transfer: ITransfer): void {
    this.queue.set(transfer.idempotencyKey, transfer);

    const query = `INSERT INTO transfers (id, payer_id, payee_id, amount, idempotency_key)
                    values($1, $2, $3, $4, $5)`;
    const values = [transfer];

    try {
      const res = pool.query(query, values);
    } catch (error) {
      console.error(error);
    }
  }

  public async getById(id: string) {
    const query = `SELECT * transfers WHERE id = $1`;
    const values = [id];

    try {
      return await pool.query(query, values);
    } catch (error) {
      console.error(error);
    }
  }
}
