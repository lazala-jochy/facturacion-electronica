import type { IncomingMessage, ServerResponse } from "http";
import { authService } from "../services/auth.service";
import type { AuthBody } from "../types/auth";
import { json, readJsonBody } from "../utils/http";

export const authController = {
  async register(req: IncomingMessage, res: ServerResponse) {
    const body = await readJsonBody<AuthBody>(req);
    const result = await authService.register(body);

    if (!result.ok) {
      return json(res, result.status, { message: result.message });
    }

    return json(res, 201, {
      message: "Cuenta creada correctamente.",
      company: result.company,
    });
  },

  async login(req: IncomingMessage, res: ServerResponse) {
    const body = await readJsonBody<AuthBody>(req);
    const result = await authService.login(body);

    if (!result.ok) {
      return json(res, result.status, { message: result.message });
    }

    return json(res, 200, {
      message: "Inicio de sesion exitoso.",
      session: { token: result.token },
      company: result.company,
    });
  },
};
