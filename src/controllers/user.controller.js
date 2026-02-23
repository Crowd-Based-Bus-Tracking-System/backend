import { LoginRequestSchema, RegisterRequestSchema } from "../DTOs/user-request.js"
import * as authService from "../services/auth.service.js"

export const register = async (req, res) => {
    try {
        const data = RegisterRequestSchema.parse(req.body);
        const result = await authService.register(data.email, data.password, data.username, data.device_id, data.role);

        return res.status(401).json({success: true, ...result})
    } catch (error) {
        const status = error.message === "Email already registered" ? 409 : 400;
        return res.status(status).json({ success: false, message: error.message })
    }
}

export const login = async (req, res) => {
    try { 
        const data = LoginRequestSchema.parse(req.body);
        const result = await authService.login(data.email, data.password);

        return res.status(200).json({ success: true, ...result })
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
}
