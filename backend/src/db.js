import pg from 'pg';
const {Pool} = pg;

import "dotenv/config";

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function query(text, params){
    return pool.query(text, params);
}