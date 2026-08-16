import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const executablePath = process.argv[2];
if (!executablePath) {
  console.error("Informe o caminho do executável empacotado.");
  process.exit(1);
}

const userDataDir = process.argv[3] ?? fs.mkdtempSync(path.join(os.tmpdir(), "a3-packaged-smoke-"));
const port = 9300 + Math.floor(Math.random() * 500);

let appProcess;

try {
  const first = await runScenario(true);
  await stopApp();
  const second = await runScenario(false);
  await stopApp();
  console.log(JSON.stringify({ userDataDir, first, second }, null, 2));
} catch (error) {
  await stopApp();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function runScenario(createData) {
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  appProcess = spawn(executablePath, [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
    env: childEnv,
    stdio: "ignore",
    windowsHide: true
  });

  const client = await connectToRenderer(port);
  try {
    const loginReady = await waitFor(
      () =>
        evaluate(
          client,
          "Boolean(window.a3) && Boolean(document.body) && document.body.innerText.includes('A3 Manager') && document.body.innerText.includes('Entrar')"
        ),
      30000
    );
    if (!loginReady) {
      throw new Error("A tela de login não renderizou no aplicativo empacotado.");
    }

    const script = createData ? createDataScenarioExpression() : persistedStateScenarioExpression();
    return await evaluate(client, script);
  } finally {
    client.close();
  }
}

function createDataScenarioExpression() {
  return `async () => {
    const user = await window.a3.login({ username: 'system dev', password: ['_', 'int', '@', '383'].join('') });
    const customerInput = {
      name: 'Cliente Smoke Inicial',
      cpf: '529.982.247-25',
      rg: '12.345.678-9',
      street: 'Rua Smoke',
      neighborhood: 'Centro',
      number: '10',
      cep: '01001-000',
      city: 'São Paulo',
      state: 'SP',
      contact: '(11) 90000-0000'
    };
    const customer = await window.a3.createCustomer(customerInput);
    const equipmentInput = {
      name: 'Compactador Smoke',
      equipmentValueCents: 200000,
      unitIndemnificationValueCents: 25000,
      stockQuantity: 3
    };
    const equipment = await window.a3.createEquipment(equipmentInput);
    const rental = await window.a3.launchRental({
      customerId: customer.id,
      period: 'MONTHLY',
      startDate: '2026-08-14',
      items: [{ equipmentId: equipment.id, quantity: 2 }],
      deliveryStreet: 'Rua da Entrega Smoke',
      deliveryNeighborhood: 'Obra',
      deliveryNumber: '99',
      deliveryCep: '04567-000',
      deliveryCity: 'São Paulo',
      deliveryState: 'SP',
      receiverIsCustomer: false,
      receiverName: 'Recebedor Smoke',
      receiverCpf: '390.533.447-05',
      paymentMethod: 'CREDIT_CARD',
      installments: 2,
      clientRequestId: crypto.randomUUID()
    });
    const stockAfterLaunch = (await window.a3.listEquipment('Compactador'))[0].stockQuantity;
    await window.a3.updateCustomer(customer.id, { ...customerInput, name: 'Cliente Smoke Editado' });
    await window.a3.updateEquipment(equipment.id, { ...equipmentInput, name: 'Compactador Smoke Editado', unitIndemnificationValueCents: 99999, stockQuantity: stockAfterLaunch });
    const historical = await window.a3.getRental(rental.id);
    const finalized = await window.a3.finalizeRental(rental.id);
    const stockAfterFinalize = (await window.a3.listEquipment('Compactador'))[0].stockQuantity;
    let secondFinalizeRejected = false;
    let secondFinalizeCode = '';
    let secondFinalizeMessage = '';
    try {
      await window.a3.finalizeRental(rental.id);
    } catch (error) {
      secondFinalizeRejected = true;
      secondFinalizeCode = error.code ?? error.name;
      secondFinalizeMessage = error.message;
    }
    const stockAfterSecondFinalize = (await window.a3.listEquipment('Compactador'))[0].stockQuantity;
    return {
      user: user.username,
      rentalCode: rental.code,
      stockAfterLaunch,
      stockAfterFinalize,
      stockAfterSecondFinalize,
      secondFinalizeRejected,
      secondFinalizeCode,
      secondFinalizeMessage,
      historicalCustomerName: historical.customerSnapshot.name,
      historicalEquipmentName: historical.items[0].nameSnapshot,
      finalizedStatus: finalized.status
    };
  }`;
}

function persistedStateScenarioExpression() {
  return `async () => {
    await window.a3.login({ username: 'SYSTEM DEV', password: ['_', 'int', '@', '383'].join('') });
    const rentals = await window.a3.listRentals({ page: 1, pageSize: 10, status: 'FINALIZED' });
    const equipment = await window.a3.listEquipment('Compactador');
    return {
      finalizedRentals: rentals.total,
      firstStatus: rentals.rows[0]?.status ?? null,
      equipmentRows: equipment.length,
      stockQuantity: equipment[0]?.stockQuantity ?? null
    };
  }`;
}

async function connectToRenderer(debugPort) {
  const endpoint = await waitFor(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`).catch(() => []);
    return targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  }, 30000);

  if (!endpoint) {
    throw new Error("Não foi possível conectar ao renderer do aplicativo empacotado.");
  }

  const socket = new WebSocket(endpoint.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        reject(new Error(payload.error.message));
      } else {
        resolve(payload.result);
      }
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    }
  };
}

async function evaluate(client, expression) {
  const wrapped = expression.trim().startsWith("async") ? `(${expression})()` : expression;
  const result = await client.send("Runtime.evaluate", {
    expression: wrapped,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.exception?.value ??
        result.exceptionDetails.text
    );
  }
  return result.result.value;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function waitFor(factory, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await factory();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function stopApp() {
  if (!appProcess || appProcess.killed) {
    return;
  }

  if (process.platform === "win32" && appProcess.pid) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(appProcess.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.on("exit", resolve);
    });
  } else {
    appProcess.kill("SIGTERM");
  }
  appProcess = null;
}
