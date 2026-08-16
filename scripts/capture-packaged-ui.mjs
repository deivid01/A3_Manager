import { spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectProcessMemory } from "./process-memory.mjs";

const executablePath = path.resolve(
  process.argv[2] ?? "release/win-unpacked/A3 Manager.exe",
);
const outputDir = path.resolve(
  process.argv[3] ?? "output/screenshots/after-0.1.5",
);
const userDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "a3-visual-validation-"),
);
const port = 9800 + Math.floor(Math.random() * 300);
const viewports = [
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x768", width: 768, height: 768 },
  { name: "390x844", width: 390, height: 844 },
];

fs.mkdirSync(outputDir, { recursive: true });
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
const appProcess = spawn(
  executablePath,
  [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`],
  { env: childEnv, stdio: "ignore", windowsHide: true },
);

let socket;
const pending = new Map();
let nextId = 1;
const screenshots = [];
let windowControls;
let memoryAfterScreenshots;
let receiverToggleAudit;

try {
  const target = await findRendererTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener("message", receiveMessage);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  await send("Page.enable");
  await send("Runtime.enable");

  const initialMaximized = await evaluate("window.a3.isWindowMaximized()");
  const toggledMaximized = await evaluate("window.a3.toggleMaximizeWindow()");
  const reportedAfterToggle = await evaluate("window.a3.isWindowMaximized()");
  const restoredMaximized = await evaluate("window.a3.toggleMaximizeWindow()");
  const reportedAfterRestore = await evaluate("window.a3.isWindowMaximized()");
  windowControls = {
    initialMaximized,
    toggledMaximized,
    reportedAfterToggle,
    restoredMaximized,
    reportedAfterRestore,
    passed:
      toggledMaximized === reportedAfterToggle &&
      restoredMaximized === reportedAfterRestore &&
      reportedAfterRestore === initialMaximized,
  };

  await waitFor("Boolean(document.querySelector('.login-panel'))");
  await captureMatrix("login");
  await login();
  await waitFor("Boolean(document.querySelector('[data-screen=rentals]'))");
  await captureMatrix("sidebar-expanded");
  await toggleSidebar();
  await captureMatrix("sidebar-collapsed");
  await setViewport(viewports[0]);
  await toggleSidebar();
  await captureMatrix("reports-empty");
  await clickButton("Filtrar");
  await waitFor("Boolean(document.querySelector('.filter-panel'))");
  await captureMatrix("reports-filters");
  await clickButton("Fechar filtros");

  await seedScenario();
  await navigate("Clientes");
  await waitFor("Boolean(document.querySelector('[data-screen=customers]'))");
  await captureMatrix("customers");
  await clickButton("Novo cliente");
  await waitFor("Boolean(document.querySelector('.customer-form-modal'))");
  await captureMatrix("customer-form");
  await closeModal(".customer-form-modal");

  await navigate("Equipamentos");
  await waitFor("Boolean(document.querySelector('[data-screen=equipment]'))");
  await captureMatrix("equipment");
  await clickButton("Novo equipamento");
  await waitFor("Boolean(document.querySelector('.equipment-form-modal'))");
  await captureMatrix("equipment-form");
  await closeModal(".equipment-form-modal");

  await navigate("Empresa");
  await waitFor("Boolean(document.querySelector('[data-screen=company]'))");
  await captureMatrix("company");

  await navigate("Usuários");
  await waitFor("Boolean(document.querySelector('[data-screen=users]'))");
  await captureMatrix("users");
  await clickButton("Novo usuário");
  await waitFor("Boolean(document.querySelector('.user-form-modal'))");
  await captureMatrix("user-form");
  await closeModal(".user-form-modal");

  await navigate("Nova locação");
  await waitFor(
    "Boolean(document.querySelector('[data-screen=rental-launch]'))",
  );
  await captureMatrix("rental-launch");
  await prepareRentalSelections();
  await captureMatrix("rental-launch-customer-receives");
  await addEquipmentBySearch("Betoneira");
  await captureMatrix("rental-launch-multiple-items");
  receiverToggleAudit = await validateReceiverToggleStability();
  await setReceiverIsCustomer(false);
  await setReceiverFields("Mariana Souza", "390.533.447-05");
  await captureMatrix("rental-launch-receiver-other", ".switch-row");
  await setCreditPayment();
  await captureMatrix("rental-launch-credit", ".choice-grid.payments");
  await setReceiverIsCustomer(true);
  await clickButton("Lançar locação");
  await waitFor("Boolean(document.querySelector('.rental-success-modal'))");
  await captureMatrix("rental-success");
  await evaluate(
    "document.querySelector('.rental-success-modal .modal-header button').click()",
  );

  await navigate("Relatórios");
  await waitFor("document.querySelectorAll('.rental-row').length >= 2");
  await captureMatrix("reports-populated");
  await evaluate("document.querySelector('.rental-row .app-button').click()");
  await waitFor("Boolean(document.querySelector('.rental-detail-modal'))");
  await captureMatrix("rental-details", ".detail-money-total");
  await wait(3000);
  memoryAfterScreenshots = collectProcessMemory(appProcess.pid);

  const manifest = {
    executablePath,
    outputDir,
    userDataDir,
    windowControls,
    receiverToggleAudit,
    memoryAfterScreenshots,
    screenshots,
  };
  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  try {
    socket?.close();
  } catch {
    socket = undefined;
  }
  stopProcessTree(appProcess.pid);
}

async function login() {
  await evaluate(`(() => {
    const form = document.querySelector('.login-form');
    const inputs = form.querySelectorAll('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inputs[0], 'SYSTEM DEV');
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], ['_', 'int', '@', '383'].join(''));
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
  })()`);
}

async function seedScenario() {
  await evaluate(`(async () => {
    const customer = await window.a3.createCustomer({
      name: 'Cliente Visual Construção', cpf: '529.982.247-25', rg: '12.345.678-9',
      street: 'Rua das Obras', neighborhood: 'Centro', number: '120', cep: '01001-000',
      city: 'São Paulo', state: 'SP', contact: '(11) 99999-1234'
    });
    const equipment = await window.a3.createEquipment({
      name: 'Compactador de Solo', equipmentValueCents: 780000,
      unitIndemnificationValueCents: 125000, stockQuantity: 8
    });
    await window.a3.createEquipment({
      name: 'Betoneira 400 Litros', equipmentValueCents: 420000,
      unitIndemnificationValueCents: 88000, stockQuantity: 4
    });
    await window.a3.launchRental({
      customerId: customer.id, period: 'MONTHLY', startDate: '2026-08-15',
      items: [{ equipmentId: equipment.id, quantity: 2 }],
      deliveryStreet: 'Avenida da Construção', deliveryNeighborhood: 'Industrial',
      deliveryNumber: '450', deliveryCep: '04567-000', deliveryCity: 'São Paulo',
      deliveryState: 'SP', receiverIsCustomer: true, receiverName: '', receiverCpf: '',
      paymentMethod: 'PIX', installments: null, clientRequestId: crypto.randomUUID()
    });
    return true;
  })()`);
}

async function prepareRentalSelections() {
  await clickButton("Buscar cliente");
  await waitFor("Boolean(document.querySelector('.customer-search-modal'))");
  await setInputValue(".customer-search-modal input", "Cliente Visual");
  await waitFor(
    "document.querySelectorAll('.customer-search-modal .search-results button').length > 0",
  );
  await captureMatrix("customer-search");
  await evaluate(
    "document.querySelector('.customer-search-modal .search-results button').click()",
  );

  await addEquipmentBySearch("Compactador");
  await waitFor(
    "document.querySelectorAll('.selected-equipment').length === 1",
  );
}

async function addEquipmentBySearch(search) {
  await clickButton("Adicionar equipamento");
  await waitFor("Boolean(document.querySelector('.equipment-search-modal'))");
  await setInputValue(".equipment-search-modal input", search);
  await waitFor(
    "document.querySelectorAll('.equipment-search-modal .search-results button').length > 0",
  );
  await captureMatrix(`equipment-search-${slug(search)}`);
  await evaluate(
    "document.querySelector('.equipment-search-modal .search-results button').click()",
  );
  await wait(160);
}

async function validateReceiverToggleStability() {
  const samples = [];
  for (let index = 0; index < 10; index += 1) {
    await evaluate("document.querySelector('.switch-row [role=switch]').click()");
    await wait(120);
    samples.push(await readRentalLaunchLayoutHealth(`toggle-${index + 1}`));
  }
  return {
    toggles: samples.length,
    finalChecked: await readReceiverChecked(),
    passed: samples.every(
      (sample) =>
        !sample.horizontalOverflow &&
        sample.viewHasHeight &&
        sample.layoutInsideViewport &&
        sample.reviewInsideContainer,
    ),
    samples,
  };
}

async function setReceiverIsCustomer(value) {
  await evaluate(`(() => {
    const control = document.querySelector('.switch-row [role=switch]');
    const checked = control.getAttribute('aria-checked') === 'true' || control.dataset.state === 'checked';
    if (checked !== ${JSON.stringify(value)}) control.click();
  })()`);
  await wait(160);
}

async function setReceiverFields(name, cpf) {
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.receiver-fields input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inputs[0], ${JSON.stringify(name)});
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inputs[1], ${JSON.stringify(cpf)});
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function setCreditPayment() {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.choice-grid.payments .choice-button')][0];
    if (!button) throw new Error('Forma de pagamento crÃ©dito nÃ£o encontrada');
    button.click();
  })()`);
  await wait(120);
  await evaluate(`(() => {
    const select = [...document.querySelectorAll('select')].find((item) =>
      [...item.options].some((option) => option.value === '2')
    );
    if (!select) throw new Error('Seletor de parcelas nÃ£o encontrado');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await wait(120);
}

async function readRentalLaunchLayoutHealth(label) {
  return evaluate(`(() => {
    const view = document.querySelector('[data-screen=rental-launch]');
    const layout = document.querySelector('.rental-launch-layout');
    const review = document.querySelector('.rental-review');
    const viewRect = view.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    const reviewRect = review.getBoundingClientRect();
    return {
      label: ${JSON.stringify(label)},
      receiverIsCustomer: (() => {
        const control = document.querySelector('.switch-row [role=switch]');
        return control.getAttribute('aria-checked') === 'true' || control.dataset.state === 'checked';
      })(),
      receiverFieldsVisible: Boolean(document.querySelector('.receiver-fields')),
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth ||
        view.scrollWidth > view.clientWidth,
      viewHasHeight: view.clientHeight > 0,
      layoutInsideViewport: layoutRect.right <= window.innerWidth + 1 && layoutRect.left >= -1,
      reviewInsideContainer:
        reviewRect.left >= viewRect.left - 1 &&
        reviewRect.right <= viewRect.right + 1 &&
        reviewRect.width > 0,
      view: {
        clientWidth: view.clientWidth,
        scrollWidth: view.scrollWidth,
        clientHeight: view.clientHeight,
        scrollHeight: view.scrollHeight,
      },
    };
  })()`);
}

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function navigate(label) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.nav-button')].find((item) => item.textContent.includes(${JSON.stringify(label)}));
    if (!button) throw new Error('Navegação não encontrada: ${label}');
    button.click();
  })()`);
  await wait(200);
}

async function clickButton(label) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim().includes(${JSON.stringify(label)}));
    if (!button) throw new Error('Botão não encontrado: ${label}');
    button.click();
  })()`);
}

async function closeModal(selector) {
  await evaluate(
    `document.querySelector(${JSON.stringify(`${selector} .modal-header button`)}).click()`,
  );
  await wait(120);
}

async function setInputValue(selector, value) {
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function scrollIntoView(selector) {
  await evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error('Elemento nÃ£o encontrado para rolagem: ${selector}');
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
  })()`);
  await wait(180);
}

async function captureMatrix(screen, anchorSelector) {
  for (const viewport of viewports) {
    await setViewport(viewport);
    if (anchorSelector) {
      await scrollIntoView(anchorSelector);
    } else {
      await wait(180);
    }
    const response = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const filename = `${screen}-${viewport.name}.png`;
    fs.writeFileSync(
      path.join(outputDir, filename),
      Buffer.from(response.data, "base64"),
    );
    screenshots.push(filename);
  }
}

async function toggleSidebar() {
  await evaluate("document.querySelector('.sidebar-collapse-button').click()");
  await wait(220);
}

async function setViewport(viewport) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function readReceiverChecked() {
  return evaluate(`(() => {
    const control = document.querySelector('.switch-row [role=switch]');
    return control.getAttribute('aria-checked') === 'true' || control.dataset.state === 'checked';
  })()`);
}

async function findRendererTarget() {
  return waitForFactory(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = await response.json();
        return targets.find(
          (target) => target.type === "page" && target.webSocketDebuggerUrl,
        );
      } catch {
        return null;
      }
    },
    20000,
    "O renderer não respondeu para a validação visual.",
  );
}

function receiveMessage(event) {
  const payload = JSON.parse(event.data);
  if (!payload.id || !pending.has(payload.id)) return;
  const operation = pending.get(payload.id);
  pending.delete(payload.id);
  if (payload.error) {
    operation.reject(new Error(payload.error.message));
  } else {
    operation.resolve(payload.result);
  }
}

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text,
    );
  }
  return result.result.value;
}

async function waitFor(expression) {
  return waitForFactory(
    () => evaluate(expression),
    15000,
    `Estado visual não encontrado: ${expression}`,
  );
}

async function waitForFactory(factory, timeoutMs, message) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await factory();
    if (value) return value;
    await wait(200);
  }
  throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}
