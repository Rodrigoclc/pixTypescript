import { QueryResult } from "pg";
import pool from "../config/connection.js";

export interface AccountRequest {
  id: string;
  balance: number;
}

export class Account {
  public async hasAccountId(id: string): Promise<boolean> {
    const query = `SELECT id FROM accounts WHERE id = $1`;
    const values = [id];

    try {
      const res = await pool.query(query, values);
      return res.rows.length > 0;
    } catch (error) {
      console.error(error);
    }
    return false;
  }

  public create(id: string, balance: number): void {
    const query = `INSERT INTO accounts (id, balance) values($1, $2)`;
    const values = [id, balance];

    try {
      const res = pool.query(query, values);
    } catch (error) {
      console.error(error);
    }
  }
}
