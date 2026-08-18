import { describe, expect, it } from "vitest";
import { assertAdminOperationAllowed } from "../src/application/authorization";
import { verifyPassword } from "../src/application/security";
import { normalizeUsernameDraft } from "../src/domain/normalization";
import { sanitizeLogMessage } from "../src/infrastructure/logging/FileLogger";
import { createTestService } from "./helpers";

describe("autenticação e logs", () => {
  it("usa salt único para senhas de usuários criados", async () => {
    const { db, service } = await createTestService();
    const first = await service.createUser({ username: "operador um", password: "senha123", role: "USER" });
    const second = await service.createUser({ username: "operador dois", password: "senha123", role: "USER" });
    const firstHash = String(db.queryOne("SELECT password_hash FROM users WHERE id = ?", [first.id])?.password_hash);
    const secondHash = String(db.queryOne("SELECT password_hash FROM users WHERE id = ?", [second.id])?.password_hash);

    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword("senha123", firstHash)).resolves.toBe(true);
  });

  it("rejeita usuário duplicado após normalização", async () => {
    const { service } = await createTestService();
    await service.createUser({ username: "operador", password: "senha123", role: "USER" });

    await expect(
      service.createUser({ username: " OPERADOR ", password: "outrasenha", role: "USER" })
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("edita usuário preservando senha quando o campo de nova senha fica vazio", async () => {
    const { service } = await createTestService();
    const created = await service.createUser({
      username: "operador",
      password: "senha123",
      role: "USER",
    });

    const updated = await service.updateUser(created.id, {
      username: "operador editado",
      password: "",
      role: "ADMIN",
      active: true,
    });

    expect(updated).toMatchObject({
      username: "OPERADOR EDITADO",
      role: "ADMIN",
      active: true,
    });
    await expect(
      service.login({ username: "operador editado", password: "senha123" }),
    ).resolves.toMatchObject({ id: created.id });

    await service.updateUser(created.id, {
      username: "operador editado",
      password: "novaSenha123",
      role: "USER",
      active: true,
    });

    await expect(
      service.login({ username: "operador editado", password: "senha123" }),
    ).rejects.toMatchObject({ code: "AUTH_INVALID" });
    await expect(
      service.login({ username: "operador editado", password: "novaSenha123" }),
    ).resolves.toMatchObject({ role: "USER" });
  });

  it("impede remover o último administrador ativo", async () => {
    const { service } = await createTestService();
    const admin = service.listUsers().find((user) => user.role === "ADMIN" && user.active);

    expect(admin).toBeDefined();
    if (!admin) {
      throw new Error("Administrador inicial não encontrado.");
    }
    await expect(
      service.updateUser(admin.id, {
        username: admin.username,
        password: "",
        role: "USER",
        active: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.updateUser(admin.id, {
        username: admin.username,
        password: "",
        role: "ADMIN",
        active: false,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("restringe gerenciamento de usuários e configuração remota a administradores", () => {
    expect(() => assertAdminOperationAllowed({ role: "ADMIN" }, "user-management")).not.toThrow();
    expect(() => assertAdminOperationAllowed({ role: "USER" }, "user-management")).toThrow();
    expect(() => assertAdminOperationAllowed({ role: "USER" }, "server-configuration")).toThrow();
  });

  it("preserva espaços durante digitação e normaliza usuário com nome composto no envio", async () => {
    const { service } = await createTestService();

    expect(normalizeUsernameDraft("system ")).toBe("SYSTEM ");
    expect(normalizeUsernameDraft("joao silva")).toBe("JOAO SILVA");

    const created = await service.createUser({
      username: "  joao   silva  ",
      password: "senha123",
      role: "USER",
    });
    expect(created.username).toBe("JOAO SILVA");
    expect(
      await service.createUser({
        username: "  maria   souza  ",
        password: "senha123",
        role: "USER",
      }),
    ).toMatchObject({ username: "MARIA SOUZA" });

    const logged = await service.login({
      username: "joao silva",
      password: "senha123",
    });
    expect(logged.username).toBe("JOAO SILVA");

    await expect(
      service.createUser({
        username: "JOAO SILVA",
        password: "outrasenha",
        role: "USER",
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("falha para usuário desconhecido sem vazar detalhes sensíveis", async () => {
    const { service } = await createTestService();

    await expect(service.login({ username: "ninguém", password: "senha123" })).rejects.toMatchObject({
      code: "AUTH_INVALID",
      message: "Usuário ou senha inválidos."
    });
  });

  it("sanitiza segredos conhecidos em mensagens de log", () => {
    const sanitized = sanitizeLogMessage(
      "password=abc _int@383 DATABASE_URL=postgres://user:secret@localhost/db senha: minha"
    );

    expect(sanitized).not.toContain("_int@383");
    expect(sanitized).not.toContain("abc");
    expect(sanitized).not.toContain("secret@localhost");
    expect(sanitized).toContain("[REDACTED]");
  });
});
