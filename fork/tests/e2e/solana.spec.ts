import { test, expect } from "@playwright/test";
import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@anchor-lang/core";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { writeFileSync, mkdirSync } from "node:fs";
import { installLocalWallet } from "../helpers/local-wallet";
import idl from "../../src/lib/contracts/generated/idl.json";
import type { ForkContracts } from "../../src/lib/contracts/generated/fork_contracts";
import type {
  AppConfig,
  MarketDescriptor,
} from "../../src/lib/contracts/generated/app-types";
import { formatUnits } from "../../src/lib/contracts/amounts";

test("live Gemini → real local-validator trading in the original Fork UI", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.RUN_SOLANA_E2E !== "1",
    "Opt in with reviewed live instruments and UTC closes; uses local mock funds only.",
  );
  test.setTimeout(300_000);
  const parentSymbol = process.env.FORK_TEST_PARENT!;
  const targetSymbol = process.env.FORK_TEST_TARGET!;
  if (
    !parentSymbol ||
    !targetSymbol ||
    !process.env.FORK_TEST_PARENT_CLOSE ||
    !process.env.FORK_TEST_TARGET_CLOSE
  )
    throw new Error(
      "Supply exact active instrument symbols and reviewed conservative UTC closes.",
    );
  const wallet = await installLocalWallet(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("fork-integration-init")) {
      localStorage.clear();
      localStorage.setItem(
        "fork-universe-v1",
        JSON.stringify({ state: { engine: "demo" }, version: 1 }),
      );
      sessionStorage.setItem("fork-integration-init", "1");
    }
  });
  await page.goto("/");
  await page.getByTestId("welcome-search").click();
  await page.getByLabel("Search targets").fill("Bitcoin");
  const liveTarget = page
    .locator('#target-list [data-event^="gemini:"]')
    .first();
  await expect(liveTarget).toBeVisible({ timeout: 45_000 });
  await liveTarget.click();
  if (await page.getByLabel("Search targets").isVisible())
    await page
      .locator("#target-list button")
      .filter({ hasText: /above|below/ })
      .first()
      .click();
  await expect(page.getByTestId("target-selector")).toContainText("Gemini");
  const eventId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("fork-universe-v1")!).state.target
        .eventId as string,
  );
  await page.getByRole("radio", { name: "MARKETS", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fork verification wallet", exact: true })
    .click();
  await page.keyboard.press("Escape");
  const positions = page.getByTestId("positions");
  await positions.getByRole("button", { name: "FORK Positions" }).click();
  await expect(positions.getByText(/Trade B conditional/)).toBeVisible();
  const existing = positions.getByRole("button", {
    name: "Choose another pair",
  });
  if (await existing.isVisible()) await existing.click();
  for (const [role, query, symbol, close] of [
    ["A", "Bitcoin", parentSymbol, process.env.FORK_TEST_PARENT_CLOSE!],
    ["B", "Solana", targetSymbol, process.env.FORK_TEST_TARGET_CLOSE!],
  ]) {
    await positions.getByLabel(`Search ${role} contracts`).fill(query);
    const item = positions
      .getByTestId(`instrument-${role}`)
      .locator(`[data-instrument="${symbol}"]`);
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.click();
    await expect(
      positions.getByLabel(`${role} trading close UTC`),
    ).toBeVisible();
    if (await positions.getByLabel(`${role} trading close UTC`).isEditable())
      await positions.getByLabel(`${role} trading close UTC`).fill(close);
    await positions.getByLabel(`Reviewed ${role} rules`).check();
  }
  await positions
    .getByRole("button", { name: "Create or connect market" })
    .click();
  const trading = page.getByTestId("trading");
  await expect(trading).toBeVisible({ timeout: 60_000 });
  await expect(trading).toContainText("pending");
  const config = (await (await request.get("/api/solana/config")).json())
    .data as AppConfig;
  const marketAddress = await positions
    .getByLabel("Existing conditional market")
    .inputValue();
  const markets = (await (await request.get("/api/solana/markets")).json())
    .data as MarketDescriptor[];
  const market = markets.find((m) => m.address === marketAddress)!;
  const connection = new Connection(config.rpc, "confirmed");
  expect(await connection.getGenesisHash()).toBe(config.genesis);
  const program = new Program<ForkContracts>(idl as ForkContracts, {
    connection,
  });
  const snapshots: unknown[] = [];
  const allSignatures = new Set<string>();
  const audit = async (index: number, label: string) => {
    const owner = wallet.signers[index].publicKey;
    const [traderAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("trader"),
        new PublicKey(marketAddress).toBuffer(),
        owner.toBuffer(),
      ],
      program.programId,
    );
    const trader = await program.account.trader.fetch(traderAddress);
    const token = await getAccount(
      connection,
      getAssociatedTokenAddressSync(new PublicKey(config.mint), owner),
    );
    for (const [key, value] of [
      ["principal", trader.principal],
      ["cash", trader.cash],
      ["yes", trader.yes],
      ["no", trader.no],
      ["wallet-collateral", token.amount],
    ] as const)
      await expect(trading.getByTestId(`balance-${key}`)).toHaveText(
        formatUnits(value),
      );
    await expect(trading.getByTestId("balance-withdrawable")).toHaveText(
      "0.000000",
    );
    const snapshot = {
      label,
      owner: owner.toBase58(),
      principal: formatUnits(trader.principal),
      cash: formatUnits(trader.cash),
      yes: formatUnits(trader.yes),
      no: formatUnits(trader.no),
      walletCollateral: formatUnits(token.amount),
    };
    snapshots.push(snapshot);
    for (const signature of await trading
      .locator("[data-signature]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-signature")!),
      ))
      allSignatures.add(signature);
    return snapshot;
  };
  const fund = async () => {
    await trading
      .getByRole("button", { name: "Get mock collateral + SOL" })
      .click();
    await expect(trading.getByTestId("balance-wallet-collateral")).toHaveText(
      "1000.000000",
      { timeout: 30_000 },
    );
  };
  const deposit = async () => {
    await trading.getByLabel("Deposit amount").fill("100");
    await trading.getByRole("button", { name: "Deposit", exact: true }).click();
    await expect(trading.getByTestId("balance-principal")).toHaveText(
      "100.000000",
      { timeout: 30_000 },
    );
  };
  const quote = async (side: string, direction: string, qty: string) => {
    await trading.getByLabel("Trade direction").selectOption(direction);
    await trading.getByLabel("Trade outcome").selectOption(side);
    await trading.getByLabel("Trade shares").fill(qty);
    await trading
      .getByRole("button", { name: "Request on-chain quote" })
      .click();
    await expect(trading.getByTestId("chain-quote")).toContainText(
      "Solana LMSR YES",
      { timeout: 30_000 },
    );
  };
  const execute = async (
    side: string,
    direction: string,
    qty: string,
    expected: string,
  ) => {
    await quote(side, direction, qty);
    await trading
      .getByRole("button", {
        name: `Confirm ${direction} ${side.toUpperCase()}`,
      })
      .click();
    await expect(trading.getByTestId(`balance-${side}`)).toHaveText(expected, {
      timeout: 30_000,
    });
  };
  await fund();
  wallet.reject();
  await trading.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(trading.getByRole("alert")).toContainText("rejected", {
    timeout: 30_000,
  });
  await expect(trading.getByTestId("balance-principal")).toHaveText("0.000000");
  await deposit();
  await audit(0, "deposit");
  await execute("yes", "buy", "10", "10.000000");
  await audit(0, "buy YES");
  await execute("no", "buy", "8", "8.000000");
  await audit(0, "buy NO");
  await execute("yes", "sell", "4", "6.000000");
  await execute("no", "sell", "3", "5.000000");
  const alice = await audit(0, "partial sells");
  await expect(
    trading.getByRole("button", { name: "Redeem eligible balance" }),
  ).toBeDisabled();
  await trading.getByLabel("Deposit amount").fill("1000000");
  await trading.getByRole("button", { name: "Deposit", exact: true }).click();
  await expect(trading.getByRole("alert")).toContainText(
    "Insufficient mock collateral",
    { timeout: 30_000 },
  );
  await trading.getByLabel("Trade direction").selectOption("sell");
  await trading.getByLabel("Trade shares").fill("999");
  await trading.getByRole("button", { name: "Request on-chain quote" }).click();
  await expect(trading.getByRole("alert")).toContainText("Simulation failed", {
    timeout: 30_000,
  });
  await quote("yes", "buy", "1");
  await page.waitForTimeout(31_000);
  await expect(
    trading.getByRole("button", { name: "Confirm buy YES" }),
  ).toBeDisabled();
  await page.route("**/api/solana/refresh", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "Gemini unavailable (injected outage test)",
      }),
    }),
  );
  await trading.getByRole("button", { name: "Request on-chain quote" }).click();
  await expect(trading.getByRole("alert")).toContainText("Gemini unavailable");
  await page.unroute("**/api/solana/refresh");
  await wallet.switchAccount(1);
  await expect(trading.getByTestId("balance-principal")).toHaveText("0.000000");
  await fund();
  await deposit();
  await execute("no", "buy", "2", "2.000000");
  await audit(1, "second wallet buy NO");
  await wallet.switchAccount(0);
  await expect(trading.getByTestId("balance-yes")).toHaveText(alice.yes);
  await page.reload();
  await page
    .getByTestId("positions")
    .getByRole("button", { name: "FORK Positions" })
    .click();
  await expect(trading.getByTestId("balance-cash")).toHaveText(alice.cash, {
    timeout: 30_000,
  });
  await audit(0, "reload and reconnect");
  await trading.getByTestId("balance-cash").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("original-fork-solana.png"),
  });
  const signatures = [...allSignatures];
  const evidence = [];
  for (const signature of signatures) {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    expect(tx?.meta?.err).toBeNull();
    evidence.push({ signature, slot: tx!.slot, fee: tx!.meta!.fee });
  }
  const m = await program.account.market.fetch(new PublicKey(marketAddress));
  const vault = await getAccount(connection, new PublicKey(market.vault));
  expect(vault.amount.toString()).toBe(
    m.lpDeposits.add(m.principal).toString(),
  );
  expect(pageErrors).toEqual([]);
  const report = {
    at: new Date().toISOString(),
    eventId,
    config,
    market,
    snapshots,
    evidence,
    vault: formatUnits(vault.amount),
    liveSettlementVerified: false,
    pageErrors,
  };
  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/solana-verification.json",
    JSON.stringify(report, null, 2),
  );
  await testInfo.attach("live-local-evidence", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
});
