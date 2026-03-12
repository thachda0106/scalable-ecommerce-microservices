import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!req.headers["x-request-id"]) {
      req.headers["x-request-id"] = uuidv4();
    }

    // Optionally expose it to external responses for debugging/tracing purposes
    res.setHeader("x-request-id", req.headers["x-request-id"]);

    next();
  }
}
