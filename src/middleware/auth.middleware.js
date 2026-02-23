import { success } from "zod";
import { verifyToken } from "../services/auth.service";

export const authenticate  = (req,res,next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader|| !authHeader.startsWith("Bearer")){
        return res.status(401).json({
            success: false,
            message:"Acess denied. No tocken provide"
        });
    }

    const token = authHeader.split(" ")[1];
    try{
        const decode = vertifyTocken(token);
        req.user = decode;
        next();
    }catch(error){
        return res.ststus(401).json({
            success:false,
            message:"Invalid or expired"
        })
    }
}

export const autherization = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(503).json({
                success: false,
                message: "You dont have permission",
            })
        }
        next();
    }
}