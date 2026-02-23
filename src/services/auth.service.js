import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { createUser, getUserByEmail } from "../models/user.js";

const JWT_SECRET = process.env.JWT_SECRET;
const EXP_JWT = "7d";

export const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, role: user.role, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: EXP_JWT }
    );
}

export const verifyToken = (token) => {
    jwt.verify(token, JWT_SECRET);
}

export const register = async (email, password, username, deviceId, role = "user") => {
    const exist = await getUserByEmail(email);
    if (exist) {
        throw new Error("Email already registered");
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await createUser(email, passwordHash, username, deviceId, role);
    const token = generateToken(user);

    return { user, token }
}

export const login = async (email, password) => {
    const user = await getUserByEmail(email);
    if (!user) {
        throw new Error("User does not exist");
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
        throw new Error("User does not exist");
    }
    const token = generateToken(user);
    const { password_hash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
}


