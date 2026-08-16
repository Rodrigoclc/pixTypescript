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

    const query = `INSERT INTO accounts (id, balance) values($1, $2)`;
    const values = [id, balance];

    try {
      pool.query(query, values);
    } catch (error) {
      console.error(error);
    }
  }
}

export const account = new Account();