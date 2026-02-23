import pool from "../config/db.js";


export const createUser = async (email, passwordHash, username, deviceId, role = "user") => {
    const result = await pool.query(
        `INSERT INTO users (email, password_hash, username, device_id, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, email, device_id, role, created_at`,
        [email, passwordHash, username, deviceId, role]
    )
    return result.rows[0];
}

export const getUserById = async (userId) => {
    const query = `SELECT * FROM users WHERE id = $1;`;
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch {

        console.error("Error fetching bus:", error.message);
        return null;
    }
}

export const getUserByEmail = async (email) => {
    const result = await pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    )
    return result.rows[0]
}

export const updateUser = async (id, fields) => {
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    if (fields.name) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(fields.name);
    }
    if (fields.email) {
        setClauses.push(`email = $${paramIndex++}`);
        values.push(fields.email);
    }
    if (fields.passwordHash) {
        setClauses.push(`password_hash = $${paramIndex++}`);
        values.push(fields.passwordHash);
    }
    if (fields.username) {
        setClauses.push(`username = $${paramIndex++}`);
        values.push(fields.username);
    }
    if (setClauses.length === 0) return null;
    values.push(id);
    const result = await pool.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
         RETURNING id, email, name, role, created_at`,
        values
    );
    return result.rows[0];
};

export const deleteUser = async (userId) => {
    const result = await pool.query(
        `DELETE FROM users WHERE id = $1`,
        [userId]
    )
    return result.rows[0];
}

export const getAllUsers = async () => {
    const res = await pool.query(
        `SELECT id, username, role, email, created_at
        FROM users
        ORDER BY created_at DESC`
    )
    return res.rows;
}

